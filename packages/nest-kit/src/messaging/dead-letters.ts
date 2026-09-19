import { MessageHeaders, type DeadLetterDto } from "@meridian/contracts";
import { decodeEnvelope, headerInt, headerString, type HeaderValue } from "./envelope";

/** Extra headers the kit adds next to the contract failure headers. */
export const KitHeaders = {
  originalPartition: "x-original-partition",
  originalOffset: "x-original-offset",
  deadLetterId: "x-dead-letter-id",
  deadLetteredAt: "x-dead-lettered-at",
  replayedFrom: "x-replayed-from",
  replayedAt: "x-replayed-at",
} as const;

/** Headers describing a failure; stripped when a dead letter is replayed so the next run starts clean. */
const FAILURE_HEADERS: string[] = [
  MessageHeaders.attempts,
  MessageHeaders.lastError,
  MessageHeaders.firstFailedAt,
  MessageHeaders.consumerGroup,
  KitHeaders.originalPartition,
  KitHeaders.originalOffset,
  KitHeaders.deadLetterId,
  KitHeaders.deadLetteredAt,
  KitHeaders.replayedFrom,
  KitHeaders.replayedAt,
];

export interface KafkaRecordLike {
  key: Buffer | string | null;
  value: Buffer | string | null;
  offset: string;
  timestamp: string;
  headers?: Record<string, HeaderValue>;
}

/** Kafka header map with every value normalised to Buffer or string (kafkajs accepts both). */
export function copyKafkaHeaders(headers: Record<string, HeaderValue> | undefined, omit: readonly string[] = []): Record<string, Buffer | string> {
  const out: Record<string, Buffer | string> = {};
  for (const [key, raw] of Object.entries(headers ?? {})) {
    if (omit.includes(key)) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (Buffer.isBuffer(value) || typeof value === "string") out[key] = value;
    else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
  }
  return out;
}

/** The record a Kafka consumer group parks on its DLT: original key and value, original headers plus failure headers. */
export function buildDltMessage(
  source: { topic: string; partition: number; message: KafkaRecordLike },
  failure: { group: string; attempts: number; lastError: string; firstFailedAt: Date },
) {
  const headers = copyKafkaHeaders(source.message.headers, [MessageHeaders.attempts, MessageHeaders.lastError, MessageHeaders.firstFailedAt, MessageHeaders.consumerGroup]);
  headers[MessageHeaders.attempts] = String(failure.attempts);
  headers[MessageHeaders.lastError] = failure.lastError;
  headers[MessageHeaders.firstFailedAt] = failure.firstFailedAt.toISOString();
  headers[MessageHeaders.consumerGroup] = failure.group;
  // A replayed record keeps pointing at the topic it was first published to.
  headers[MessageHeaders.originalTopic] = headerString(source.message.headers, MessageHeaders.originalTopic) ?? source.topic;
  headers[KitHeaders.originalPartition] = String(source.partition);
  headers[KitHeaders.originalOffset] = source.message.offset;
  headers[KitHeaders.deadLetteredAt] = new Date().toISOString();
  return { key: source.message.key, value: source.message.value, headers };
}

/** The record produced to `meridian.replay.<group>` for one DLT record: failure headers removed, provenance added. */
export function buildReplayMessage(dltTopic: string, id: string, message: KafkaRecordLike) {
  const headers = copyKafkaHeaders(message.headers, FAILURE_HEADERS);
  headers[KitHeaders.replayedFrom] = `${dltTopic}/${id}`;
  headers[KitHeaders.replayedAt] = new Date().toISOString();
  return { key: message.key, value: message.value, headers };
}

/** Stable opaque id of a DLT record: partition, offset and broker timestamp (so a recreated topic never collides). */
export function kafkaDeadLetterId(partition: number, message: Pick<KafkaRecordLike, "offset" | "timestamp">): string {
  return `k-${partition}-${message.offset}-${message.timestamp}`;
}

export function parseKafkaDeadLetterId(id: string): { partition: number; offset: bigint } | null {
  const match = /^k-(\d+)-(\d+)-(\d+)$/.exec(id);
  return match ? { partition: Number(match[1]), offset: BigInt(match[2]) } : null;
}

function safeEnvelope(body: Buffer | string | null) {
  try {
    return decodeEnvelope(body);
  } catch {
    return null;
  }
}

function isoOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function kafkaDeadLetterDto(topic: string, partition: number, message: KafkaRecordLike): DeadLetterDto {
  const envelope = safeEnvelope(message.value);
  const headers = message.headers;
  return {
    id: kafkaDeadLetterId(partition, message),
    source: "kafka",
    queueOrTopic: topic,
    name: headerString(headers, MessageHeaders.messageName) ?? envelope?.name ?? "unknown",
    messageId: headerString(headers, MessageHeaders.messageId) ?? envelope?.messageId ?? "",
    correlationId: headerString(headers, MessageHeaders.correlationId) ?? envelope?.correlationId ?? "",
    attempts: headerInt(headers, MessageHeaders.attempts),
    lastError: headerString(headers, MessageHeaders.lastError) ?? "",
    firstFailedAt: isoOrNull(headerString(headers, MessageHeaders.firstFailedAt)),
    payload: envelope ? envelope.payload : message.value === null ? null : message.value.toString(),
  };
}

export interface AmqpMessageLike {
  content: Buffer;
  properties: { messageId?: string; correlationId?: string; type?: string; headers?: Record<string, unknown> };
}

/** Opaque id of a DLQ message: the id stamped when it was dead-lettered, falling back to the messageId. */
export function rabbitDeadLetterId(message: AmqpMessageLike): string {
  const headers = message.properties.headers as Record<string, HeaderValue> | undefined;
  return headerString(headers, KitHeaders.deadLetterId) ?? `m-${message.properties.messageId ?? ""}`;
}

export function rabbitDeadLetterDto(queue: string, message: AmqpMessageLike): DeadLetterDto {
  const envelope = safeEnvelope(message.content);
  const headers = message.properties.headers as Record<string, HeaderValue> | undefined;
  return {
    id: rabbitDeadLetterId(message),
    source: "rabbit",
    queueOrTopic: queue,
    name: message.properties.type ?? headerString(headers, MessageHeaders.messageName) ?? envelope?.name ?? "unknown",
    messageId: message.properties.messageId ?? headerString(headers, MessageHeaders.messageId) ?? envelope?.messageId ?? "",
    correlationId: message.properties.correlationId ?? headerString(headers, MessageHeaders.correlationId) ?? envelope?.correlationId ?? "",
    attempts: headerInt(headers, MessageHeaders.attempts),
    lastError: headerString(headers, MessageHeaders.lastError) ?? "",
    firstFailedAt: isoOrNull(headerString(headers, MessageHeaders.firstFailedAt)),
    payload: envelope ? envelope.payload : message.content.toString("utf8"),
  };
}

/** AMQP headers for a DLQ message being replayed: failure state reset, provenance kept. */
export function rabbitReplayHeaders(headers: Record<string, unknown> | undefined, id: string, dlq: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers ?? {})) if (!FAILURE_HEADERS.includes(key) && !key.startsWith("x-death") && !/^x-(first|last)-death-/.test(key)) out[key] = value;
  out[KitHeaders.replayedFrom] = `${dlq}/${id}`;
  out[KitHeaders.replayedAt] = new Date().toISOString();
  return out;
}
