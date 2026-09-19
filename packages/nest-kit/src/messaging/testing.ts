import type { CommandEnvelope, CommandName, CommandPayloads, EventEnvelope, EventName, EventPayloads } from "@meridian/contracts";
import { randomUUID } from "node:crypto";
import { RequestContext, serviceName } from "../core";
import { MessagingNames } from "./config";
import { currentTraceparent, kafkaRecordFor } from "./envelope";
import { uuidv7 } from "./ids";
import type { KafkaMessaging } from "./kafka";
import type { RabbitMessaging } from "./rabbit";
import { handlerRegistry } from "./registry";

type EnvelopeOverrides = Partial<Pick<EventEnvelope, "messageId" | "correlationId" | "causationId" | "aggregateType" | "aggregateId" | "occurredAt" | "producer">>;

function baseEnvelope(overrides: EnvelopeOverrides) {
  const ctx = RequestContext.get();
  return {
    messageId: overrides.messageId ?? uuidv7(),
    version: 1 as const,
    occurredAt: overrides.occurredAt ?? new Date().toISOString(),
    producer: overrides.producer ?? serviceName(),
    correlationId: overrides.correlationId ?? ctx?.correlationId ?? randomUUID(),
    causationId: overrides.causationId ?? ctx?.causationId ?? null,
    aggregateType: overrides.aggregateType ?? null,
    aggregateId: overrides.aggregateId ?? null,
  };
}

/** A valid event envelope as the outbox relay would publish it. */
export function buildEventEnvelopeForTests<N extends EventName>(name: N, payload: EventPayloads[N], overrides: EnvelopeOverrides = {}): EventEnvelope<N> {
  return { ...baseEnvelope(overrides), kind: "event", name, payload };
}

/** A valid command envelope as the outbox relay would publish it. */
export function buildCommandEnvelopeForTests<N extends CommandName>(name: N, payload: CommandPayloads[N], overrides: EnvelopeOverrides = {}): CommandEnvelope<N> {
  return { ...baseEnvelope(overrides), kind: "command", name, payload };
}

/**
 * Publishes an envelope straight to the broker, bypassing the outbox: events to their namespaced Kafka topic
 * (key = aggregateId ?? messageId), commands to the commands exchange. `times` > 1 produces exact duplicates,
 * which is how tests exercise inbox dedupe.
 */
export async function publishEnvelopeForTests(
  transport: { kafka?: KafkaMessaging; rabbit?: RabbitMessaging },
  envelope: EventEnvelope | CommandEnvelope,
  options: { times?: number } = {},
): Promise<void> {
  const times = Math.max(1, options.times ?? 1);
  const traceparent = currentTraceparent();
  for (let i = 0; i < times; i++) {
    if (envelope.kind === "event") {
      if (!transport.kafka) throw new Error("publishEnvelopeForTests: an event needs a KafkaMessaging instance");
      await transport.kafka.send(MessagingNames.topicForEvent(envelope.name as EventName), [kafkaRecordFor(envelope, traceparent)]);
    } else {
      if (!transport.rabbit) throw new Error("publishEnvelopeForTests: a command needs a RabbitMessaging instance");
      await transport.rabbit.publishCommand(envelope, traceparent);
    }
  }
}

/** Forgets every registered Kafka/RabbitMQ handler and dead-letter listener (between test cases). */
export function resetMessagingHandlersForTests(): void {
  handlerRegistry.clear();
}
