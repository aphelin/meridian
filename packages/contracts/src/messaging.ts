/**
 * Messaging topology. Kafka carries domain events (facts, replayable, many consumer groups).
 * RabbitMQ carries commands (work that must be done once, with retry tiers and a dead-letter queue).
 * Every name below is prefixed with `${MESSAGING_NAMESPACE}.` when that env var is set (tests use it for isolation).
 */
export const KafkaTopics = {
  identity: "meridian.identity",
  catalog: "meridian.catalog",
  inventory: "meridian.inventory",
  checkout: "meridian.checkout",
  payment: "meridian.payment",
  notification: "meridian.notification",
} as const;
export type BoundedContext = keyof typeof KafkaTopics;
export type KafkaTopic = (typeof KafkaTopics)[BoundedContext];

export const KAFKA_PARTITIONS = 3;

/** Poison events for one consumer group, after in-process retries are exhausted. */
export const dltTopic = (group: string) => `meridian.dlt.${group}`;
/** Replayed dead letters for one consumer group; only that group subscribes, so other groups never see duplicates. */
export const replayTopic = (group: string) => `meridian.replay.${group}`;

export const ConsumerGroups = {
  searchIndexer: "search-indexer",
  analyticsProjector: "analytics-projector",
  catalogPurchases: "catalog-purchases",
  notificationDispatcher: "notification-dispatcher",
  checkoutIdentity: "checkout-identity",
  inventoryCatalogSync: "inventory-catalog-sync",
} as const;
export type ConsumerGroup = (typeof ConsumerGroups)[keyof typeof ConsumerGroups];

/** In-process retry backoff for Kafka handlers before an event is parked on the group's DLT. Override: KAFKA_RETRY_DELAYS_MS. */
export const KAFKA_RETRY_DELAYS_MS = [500, 2_000, 5_000] as const;

export const RabbitTopology = {
  /** Direct exchange; routing key = command name; queue name = command name. */
  commandsExchange: "meridian.commands",
  /** Direct exchange for delayed retries; each queue has one retry queue per delay tier. */
  retryExchange: "meridian.retry",
  /** Direct exchange for dead letters; routing key = queue name; queue `${queue}.dlq`. */
  deadLetterExchange: "meridian.dlx",
} as const;

/** Delay before attempt 2, 3 and 4. After the 4th failed attempt the message goes to `${queue}.dlq`. Override: RABBIT_RETRY_DELAYS_MS. */
export const RABBIT_RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;
export const RABBIT_MAX_ATTEMPTS = RABBIT_RETRY_DELAYS_MS.length + 1;
export const retryQueueName = (queue: string, delayMs: number) => `${queue}.retry.${delayMs}ms`;
export const dlqName = (queue: string) => `${queue}.dlq`;

/** Headers carried on Kafka records and RabbitMQ messages. */
export const MessageHeaders = {
  correlationId: "x-correlation-id",
  messageId: "x-message-id",
  messageName: "x-message-name",
  causationId: "x-causation-id",
  traceparent: "traceparent",
  attempts: "x-attempts",
  lastError: "x-last-error",
  originalTopic: "x-original-topic",
  consumerGroup: "x-consumer-group",
  firstFailedAt: "x-first-failed-at",
} as const;

/** HTTP headers shared by the BFF and services. */
export const HttpHeaders = {
  correlationId: "x-correlation-id",
  cartId: "x-cart-id",
  idempotencyKey: "idempotency-key",
  captchaToken: "x-captcha-token",
  orderAccess: "x-order-access",
  forwardedFor: "x-forwarded-for",
} as const;

export interface MessageEnvelope<Name extends string = string, Payload = unknown> {
  /** UUID; equals the outbox row id; consumers dedupe on it (Inbox). */
  messageId: string;
  kind: "event" | "command";
  name: Name;
  version: 1;
  occurredAt: string;
  /** Service name that wrote the outbox row, e.g. "checkout-service". */
  producer: string;
  correlationId: string;
  /** messageId of the message whose handler produced this one, when any. */
  causationId: string | null;
  aggregateType: string | null;
  aggregateId: string | null;
  payload: Payload;
}
