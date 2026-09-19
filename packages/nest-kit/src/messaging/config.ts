import {
  EventContext,
  KAFKA_RETRY_DELAYS_MS,
  KafkaTopics,
  RABBIT_RETRY_DELAYS_MS,
  RabbitTopology,
  dlqName,
  dltTopic,
  replayTopic,
  retryQueueName,
  type EventName,
} from "@meridian/contracts";
import { namespaced } from "../core";

/**
 * Parses a comma-separated list of positive millisecond delays. Blank, malformed or non-positive entries make the
 * whole value invalid, in which case the contract default is used (a half-parsed retry schedule is worse than none).
 */
export function parseDelayList(raw: string | undefined, fallback: readonly number[]): number[] {
  if (raw === undefined || raw.trim() === "") return [...fallback];
  const parts = raw.split(",").map((part) => part.trim());
  const values = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
  if (!values.length || values.some((value) => !Number.isSafeInteger(value) || value <= 0)) return [...fallback];
  return values;
}

export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Runtime messaging settings read from the environment at call time (tests and probes set them per process). */
export function messagingSettings(env: NodeJS.ProcessEnv = process.env) {
  const rabbitRetryDelaysMs = parseDelayList(env.RABBIT_RETRY_DELAYS_MS, RABBIT_RETRY_DELAYS_MS);
  return {
    kafkaBrokers: (env.KAFKA_BROKERS ?? "localhost:9092")
      .split(",")
      .map((broker) => broker.trim())
      .filter(Boolean),
    rabbitUrl: env.RABBIT_URL ?? "amqp://localhost:5672",
    kafkaRetryDelaysMs: parseDelayList(env.KAFKA_RETRY_DELAYS_MS, KAFKA_RETRY_DELAYS_MS),
    rabbitRetryDelaysMs,
    /** Every delivery counts: the first delivery plus one per retry tier. */
    rabbitMaxAttempts: rabbitRetryDelaysMs.length + 1,
    outboxPollMs: parsePositiveInt(env.OUTBOX_POLL_MS, 500),
  };
}
export type MessagingSettings = ReturnType<typeof messagingSettings>;

export function isEventName(name: unknown): name is EventName {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(EventContext, name);
}

/**
 * Physical broker names. Every name goes through core `namespaced()` so a MESSAGING_NAMESPACE isolates a test run
 * from the shared brokers. Consumer groups, chaos targets and metric labels use the logical (un-namespaced) names.
 */
export const MessagingNames = {
  /** Kafka topic of the bounded context that owns the event. */
  topicForEvent(name: EventName): string {
    const context = EventContext[name];
    if (!context) throw new Error(`Unknown event name "${name}"`);
    return namespaced(KafkaTopics[context]);
  },
  groupId(group: string): string {
    return namespaced(group);
  },
  dltTopic(group: string): string {
    return namespaced(dltTopic(group));
  },
  replayTopic(group: string): string {
    return namespaced(replayTopic(group));
  },
  /** Every topic a group subscribes to: its events' topics (deduplicated, sorted) plus its replay topic. */
  groupTopics(group: string, events: readonly EventName[]): string[] {
    const topics = new Set(events.map((event) => MessagingNames.topicForEvent(event)));
    return [...[...topics].sort(), MessagingNames.replayTopic(group)];
  },
  commandsExchange(): string {
    return namespaced(RabbitTopology.commandsExchange);
  },
  retryExchange(): string {
    return namespaced(RabbitTopology.retryExchange);
  },
  deadLetterExchange(): string {
    return namespaced(RabbitTopology.deadLetterExchange);
  },
  /** Command queue; also the routing key on the commands exchange. */
  commandQueue(command: string): string {
    return namespaced(command);
  },
  retryQueue(command: string, delayMs: number): string {
    return retryQueueName(namespaced(command), delayMs);
  },
  dlq(command: string): string {
    return dlqName(namespaced(command));
  },
};
