import { MessageHeaders, type CommandEnvelope, type MessageEnvelope } from "@meridian/contracts";
import { randomUUID } from "node:crypto";
import { createLogger, injectChaos } from "../core";
import { KitHeaders } from "./dead-letters";
import { consumerContext, decodeEnvelope, headerInt, headerString, runInMessageContext, type HeaderValue } from "./envelope";
import { errorText, isPermanentError } from "./errors";
import type { DeadLetterInfo, RabbitHandlerRegistration } from "./registry";
import { decideRabbitFailure, republishableHeaders } from "./retry";

const log = createLogger("RabbitConsumer");

function safely(fn: () => void, action: string, messageId: string) {
  try {
    fn();
  } catch (error) {
    log.warn(`${action} failed; the broker will redeliver`, { messageId, error: errorText(error) });
  }
}

export interface RabbitDeliveryLike {
  content: Buffer;
  properties: {
    messageId?: string;
    correlationId?: string;
    type?: string;
    contentType?: string;
    contentEncoding?: string;
    appId?: string;
    timestamp?: number;
    headers?: Record<string, unknown>;
  };
}

export interface RabbitPublishOptions {
  persistent: boolean;
  mandatory: boolean;
  messageId?: string;
  correlationId?: string;
  type?: string;
  contentType?: string;
  contentEncoding?: string;
  appId?: string;
  timestamp?: number;
  headers: Record<string, unknown>;
}

export interface RabbitDeliveryDeps {
  registration: RabbitHandlerRegistration;
  delaysMs: readonly number[];
  /** Publishes with publisher confirms; resolves only when the broker confirmed a routed message. */
  publish(exchange: string, routingKey: string, content: Buffer, options: RabbitPublishOptions): Promise<void>;
  ack(): void;
  nack(requeue: boolean): void;
  onDeadLetter?(envelope: MessageEnvelope | null, info: DeadLetterInfo): Promise<void> | void;
  /** Wait before requeueing a delivery whose failure could not be recorded (avoids a hot redelivery loop). */
  requeueDelayMs?: number;
  now?: () => Date;
}

export type RabbitDeliveryResult = "success" | "retry" | "dead-letter" | "requeued";

export interface RabbitDeliveryOutcome {
  result: RabbitDeliveryResult;
  attempts: number;
  lastError?: string;
}

/**
 * Handles one command delivery. `x-attempts` counts completed failed deliveries, so this delivery is attempt
 * `x-attempts + 1`. The handler runs inside RequestContext and the message's trace context, after chaos injection.
 * Success → ack. Failure → a copy goes to the next retry tier (TTL queue that dead-letters back to the command
 * queue) or to the DLQ, confirmed by the broker, and only then is the original acked. If that publish fails the
 * original is requeued, so a message is never lost between tiers.
 */
export async function processRabbitDelivery(message: RabbitDeliveryLike, deps: RabbitDeliveryDeps): Promise<RabbitDeliveryOutcome> {
  const now = deps.now ?? (() => new Date());
  const command = deps.registration.command;
  const headers = message.properties.headers as Record<string, HeaderValue> | undefined;
  const attempt = headerInt(headers, MessageHeaders.attempts) + 1;

  let envelope: CommandEnvelope | null = null;
  let failure: unknown;
  try {
    envelope = decodeEnvelope(message.content) as CommandEnvelope;
    if (envelope.kind !== "command") throw new Error(`expected a command, got a ${envelope.kind}`);
  } catch (error) {
    failure = error instanceof Error && !isPermanentError(error) ? Object.assign(error, { permanent: true }) : error;
    envelope = null;
  }

  const ctx = envelope
    ? consumerContext(envelope, headers)
    : { correlationId: message.properties.correlationId || randomUUID(), messageId: message.properties.messageId || "unknown", traceparent: headerString(headers, MessageHeaders.traceparent) ?? null };

  return runInMessageContext(ctx, async () => {
    if (envelope) {
      const started = Date.now();
      let handled = false;
      try {
        await injectChaos(`handler:rabbit:${command}`);
        await deps.registration.handle(envelope, { attempt, maxAttempts: deps.delaysMs.length + 1 });
        handled = true;
      } catch (error) {
        failure = error;
      }
      if (handled) {
        // An ack that cannot be sent (channel gone) means a redelivery; the handler's Inbox makes that harmless.
        safely(() => deps.ack(), "ack after success", ctx.messageId);
        log.info("message handled", { transport: "rabbit", command, name: envelope.name, messageId: envelope.messageId, attempt, durationMs: Date.now() - started });
        return { result: "success" as const, attempts: attempt };
      }
    }

    const permanent = isPermanentError(failure);
    const lastError = errorText(failure);
    const decision = decideRabbitFailure(command, attempt, deps.delaysMs, permanent);
    const outHeaders: Record<string, unknown> = {
      ...republishableHeaders(message.properties.headers),
      [MessageHeaders.attempts]: decision.attempts,
      [MessageHeaders.lastError]: lastError,
      [MessageHeaders.firstFailedAt]: headerString(headers, MessageHeaders.firstFailedAt) ?? now().toISOString(),
    };
    if (decision.action === "dead-letter") {
      outHeaders[KitHeaders.deadLetterId] = randomUUID();
      outHeaders[KitHeaders.deadLetteredAt] = now().toISOString();
    }
    const fields = { command, name: envelope?.name ?? message.properties.type, messageId: ctx.messageId, attempt, permanent, error: lastError };
    try {
      await deps.publish(decision.exchange, decision.routingKey, message.content, {
        persistent: true,
        mandatory: true,
        messageId: message.properties.messageId,
        correlationId: message.properties.correlationId,
        type: message.properties.type,
        contentType: message.properties.contentType ?? "application/json",
        contentEncoding: message.properties.contentEncoding,
        appId: message.properties.appId,
        timestamp: message.properties.timestamp,
        headers: outHeaders,
      });
    } catch (publishError) {
      log.error("could not route failed command to retry/DLQ; requeueing", { ...fields, target: decision.queue, publishError: errorText(publishError) });
      if (deps.requeueDelayMs) await new Promise((resolve) => setTimeout(resolve, deps.requeueDelayMs));
      safely(() => deps.nack(true), "nack for requeue", ctx.messageId);
      return { result: "requeued" as const, attempts: attempt, lastError };
    }
    safely(() => deps.ack(), "ack after rerouting", ctx.messageId);

    if (decision.action === "retry") {
      log.warn("handler failed; scheduled retry", { ...fields, retryInMs: decision.delayMs, queue: decision.queue });
      return { result: "retry" as const, attempts: attempt, lastError };
    }
    log.error("handler failed; moved to DLQ", { ...fields, queue: decision.queue, reason: decision.reason });
    if (deps.onDeadLetter) {
      try {
        await deps.onDeadLetter(envelope, { queue: decision.queue, attempts: decision.attempts, lastError, permanent });
      } catch (listenerError) {
        log.error("dead-letter listener failed", { command, messageId: ctx.messageId, error: errorText(listenerError) });
      }
    }
    return { result: "dead-letter" as const, attempts: attempt, lastError };
  });
}
