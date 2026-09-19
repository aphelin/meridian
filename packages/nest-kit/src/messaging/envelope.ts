import { MessageHeaders, type MessageEnvelope } from "@meridian/contracts";
import { ROOT_CONTEXT, context, isSpanContextValid, propagation, trace, type SpanContext } from "@opentelemetry/api";
import { RequestContext } from "../core";
import { InvalidEnvelopeError } from "./errors";

/** A row of the contract `Outbox` table as read by the relay. */
export interface OutboxRow {
  id: string;
  kind: string;
  name: string;
  aggregateType: string | null;
  aggregateId: string | null;
  payload: unknown;
  correlationId: string;
  causationId: string | null;
  traceparent: string | null;
  createdAt: Date;
  attempts: number;
}

export type HeaderValue = Buffer | string | (Buffer | string)[] | undefined | null | number | boolean | object;

/** Builds the wire envelope for an outbox row. `messageId` is the row id, so consumers can dedupe on it. */
export function buildEnvelope(row: OutboxRow, producer: string): MessageEnvelope {
  if (row.kind !== "event" && row.kind !== "command") throw new InvalidEnvelopeError(`Outbox row ${row.id} has unknown kind "${row.kind}"`);
  return {
    messageId: row.id,
    kind: row.kind,
    name: row.name,
    version: 1,
    occurredAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
    producer,
    correlationId: row.correlationId,
    causationId: row.causationId ?? null,
    aggregateType: row.aggregateType ?? null,
    aggregateId: row.aggregateId ?? null,
    payload: row.payload,
  };
}

/** Headers carried on every Kafka record and RabbitMQ message (contracts `MessageHeaders`). */
export function messageHeaders(envelope: MessageEnvelope, traceparent?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    [MessageHeaders.messageId]: envelope.messageId,
    [MessageHeaders.messageName]: envelope.name,
    [MessageHeaders.correlationId]: envelope.correlationId,
  };
  if (envelope.causationId) headers[MessageHeaders.causationId] = envelope.causationId;
  if (traceparent && isTraceparent(traceparent)) headers[MessageHeaders.traceparent] = traceparent;
  return headers;
}

/** Kafka record for an event envelope: key = aggregateId, or messageId when the event has no aggregate. */
export function kafkaRecordFor(envelope: MessageEnvelope, traceparent?: string | null) {
  return {
    key: envelope.aggregateId ?? envelope.messageId,
    value: JSON.stringify(envelope),
    headers: messageHeaders(envelope, traceparent),
  };
}

/** amqplib publish options for a command envelope: persistent, with ids, type and the contract headers. */
export function rabbitPublishOptions(envelope: MessageEnvelope, traceparent?: string | null) {
  return {
    persistent: true,
    mandatory: true,
    contentType: "application/json",
    contentEncoding: "utf-8",
    messageId: envelope.messageId,
    correlationId: envelope.correlationId,
    type: envelope.name,
    appId: envelope.producer,
    timestamp: Math.floor(Date.parse(envelope.occurredAt) / 1000) || Math.floor(Date.now() / 1000),
    headers: messageHeaders(envelope, traceparent) as Record<string, unknown>,
  };
}

/** First value of a Kafka or AMQP header as a string. */
export function headerString(headers: Record<string, HeaderValue> | undefined | null, key: string): string | undefined {
  if (!headers) return undefined;
  let value = headers[key];
  if (Array.isArray(value)) value = value[0];
  if (value === undefined || value === null) return undefined;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/** Non-negative integer header (e.g. `x-attempts`); anything else counts as 0. */
export function headerInt(headers: Record<string, HeaderValue> | undefined | null, key: string): number {
  const raw = headerString(headers, key);
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return 0;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) ? value : 0;
}

/** Decodes and validates a message body. Throws `InvalidEnvelopeError` (permanent) on anything malformed. */
export function decodeEnvelope(body: Buffer | string | null | undefined): MessageEnvelope {
  if (body === null || body === undefined || body.length === 0) throw new InvalidEnvelopeError("Message has an empty body");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : body);
  } catch {
    throw new InvalidEnvelopeError("Message body is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new InvalidEnvelopeError("Message body is not an envelope object");
  const env = parsed as Record<string, unknown>;
  const requireString = (field: string) => {
    if (typeof env[field] !== "string" || !(env[field] as string)) throw new InvalidEnvelopeError(`Envelope field "${field}" must be a non-empty string`);
  };
  requireString("messageId");
  requireString("name");
  requireString("correlationId");
  if (env.kind !== "event" && env.kind !== "command") throw new InvalidEnvelopeError(`Envelope kind must be "event" or "command"`);
  if (!("payload" in env)) throw new InvalidEnvelopeError("Envelope has no payload");
  return {
    messageId: env.messageId as string,
    kind: env.kind,
    name: env.name as string,
    version: 1,
    occurredAt: typeof env.occurredAt === "string" ? env.occurredAt : new Date().toISOString(),
    producer: typeof env.producer === "string" ? env.producer : "unknown",
    correlationId: env.correlationId as string,
    causationId: typeof env.causationId === "string" ? env.causationId : null,
    aggregateType: typeof env.aggregateType === "string" ? env.aggregateType : null,
    aggregateId: typeof env.aggregateId === "string" ? env.aggregateId : null,
    payload: env.payload,
  };
}

const TRACEPARENT = /^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/;

export function isTraceparent(value: string): boolean {
  return TRACEPARENT.test(value) && !value.startsWith("ff-") && !/^[\da-f]{2}-0{32}-/.test(value) && !/-0{16}-[\da-f]{2}$/.test(value);
}

export function formatTraceparent(span: SpanContext): string | null {
  if (!isSpanContextValid(span)) return null;
  return `00-${span.traceId}-${span.spanId}-${(span.traceFlags & 0xff).toString(16).padStart(2, "0")}`;
}

/** W3C traceparent of the active OpenTelemetry span, or null when no valid span is active. */
export function currentTraceparent(): string | null {
  const span = trace.getActiveSpan();
  return span ? formatTraceparent(span.spanContext()) : null;
}

/** Runs `fn` inside the trace context carried by a stored or received traceparent; plain call when there is none. */
export function withTraceparent<T>(traceparent: string | null | undefined, fn: () => T, base = ROOT_CONTEXT): T {
  if (!traceparent || !isTraceparent(traceparent)) return fn();
  return context.with(propagation.extract(base, { traceparent }), fn);
}

/** Correlation data a consumer derives from a received message: headers first, envelope as fallback. */
export function consumerContext(envelope: MessageEnvelope, headers: Record<string, HeaderValue> | undefined | null) {
  return {
    correlationId: headerString(headers, MessageHeaders.correlationId) || envelope.correlationId,
    messageId: headerString(headers, MessageHeaders.messageId) || envelope.messageId,
    traceparent: headerString(headers, MessageHeaders.traceparent) ?? null,
  };
}

/** Opens `RequestContext` (causation = the handled message) inside the message's trace context, then runs `fn`. */
export function runInMessageContext<T>(ctx: { correlationId: string; messageId: string; traceparent: string | null }, fn: () => Promise<T>): Promise<T> {
  return withTraceparent(ctx.traceparent, () => RequestContext.run({ correlationId: ctx.correlationId, causationId: ctx.messageId }, fn), context.active());
}
