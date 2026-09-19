import type { EventEnvelope } from "@meridian/contracts";
import { createLogger, injectChaos } from "../core";
import { buildDltMessage, type KafkaRecordLike } from "./dead-letters";
import { consumerContext, decodeEnvelope, runInMessageContext } from "./envelope";
import { errorText, isPermanentError } from "./errors";
import type { KafkaHandlerRegistration } from "./registry";
import { interruptibleSleep, kafkaRetryDelay } from "./retry";

const log = createLogger("KafkaConsumer");

export type KafkaRecordResult = "success" | "skipped" | "dead-letter" | "aborted";

export interface KafkaRecordOutcome {
  result: KafkaRecordResult;
  attempts: number;
  lastError?: string;
}

export interface KafkaRecordDeps {
  group: string;
  handlers: readonly KafkaHandlerRegistration[];
  delaysMs: readonly number[];
  /** False once the partition was revoked or the consumer is stopping: stop retrying and leave the offset uncommitted. */
  isActive(): boolean;
  heartbeat(): Promise<void>;
  /** Produces the failed record to the group's DLT; must resolve only once the broker acknowledged it. */
  deadLetter(message: ReturnType<typeof buildDltMessage>): Promise<void>;
  sleep?: typeof interruptibleSleep;
  now?: () => Date;
}

/**
 * Handles one Kafka record for a consumer group: decode, dispatch to the handlers subscribed to the event name,
 * retry in-process with the configured delays (heartbeating while waiting), then park it on the DLT.
 * The caller commits the offset for every result except "aborted".
 */
export async function processKafkaRecord(source: { topic: string; partition: number; message: KafkaRecordLike }, deps: KafkaRecordDeps): Promise<KafkaRecordOutcome> {
  const sleep = deps.sleep ?? interruptibleSleep;
  const now = deps.now ?? (() => new Date());
  let envelope: EventEnvelope;
  try {
    envelope = decodeEnvelope(source.message.value) as EventEnvelope;
    if (envelope.kind !== "event") throw new Error(`expected an event, got a ${envelope.kind}`);
  } catch (error) {
    const lastError = errorText(error);
    log.error("undecodable record parked on DLT", { group: deps.group, topic: source.topic, partition: source.partition, offset: source.message.offset, error: lastError });
    await deps.deadLetter(buildDltMessage(source, { group: deps.group, attempts: 1, lastError, firstFailedAt: now() }));
    return { result: "dead-letter", attempts: 1, lastError };
  }

  const handlers = deps.handlers.filter((handler) => handler.events.includes(envelope.name));
  if (!handlers.length) return { result: "skipped", attempts: 0 };

  const ctx = consumerContext(envelope, source.message.headers);
  let firstFailedAt: Date | null = null;
  let lastError = "";
  let attempt = 1;
  for (;;) {
    const started = Date.now();
    try {
      await runInMessageContext(ctx, async () => {
        await injectChaos(`handler:kafka:${deps.group}`);
        for (const handler of handlers) {
          await handler.handle(envelope, { topic: source.topic, partition: source.partition, offset: source.message.offset, attempt, maxAttempts: deps.delaysMs.length + 1 });
        }
        log.info("message handled", { transport: "kafka", group: deps.group, name: envelope.name, messageId: envelope.messageId, attempt, durationMs: Date.now() - started });
      });
      return { result: "success", attempts: attempt };
    } catch (error) {
      firstFailedAt ??= now();
      lastError = errorText(error);
      const permanent = isPermanentError(error);
      const delay = permanent ? null : kafkaRetryDelay(attempt + 1, deps.delaysMs);
      if (delay === null) {
        await runInMessageContext(ctx, async () => {
          log.error("handler failed; parking record on DLT", { transport: "kafka", group: deps.group, name: envelope.name, messageId: envelope.messageId, attempts: attempt, permanent, error: lastError });
        });
        await deps.deadLetter(buildDltMessage(source, { group: deps.group, attempts: attempt, lastError, firstFailedAt }));
        return { result: "dead-letter", attempts: attempt, lastError };
      }
      await runInMessageContext(ctx, async () => {
        log.warn("handler failed; retrying", { transport: "kafka", group: deps.group, name: envelope.name, messageId: envelope.messageId, attempt, retryInMs: delay, error: lastError });
      });
      const keepGoing = await sleep(delay, () => !deps.isActive(), deps.heartbeat, 1000);
      if (!keepGoing) return { result: "aborted", attempts: attempt, lastError };
      attempt += 1;
    }
  }
}
