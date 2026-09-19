import { MessageHeaders } from "@meridian/contracts";
import { ROOT_CONTEXT, trace, TraceFlags } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";
import { RequestContext } from "../core";
import {
  buildEnvelope,
  consumerContext,
  decodeEnvelope,
  formatTraceparent,
  headerInt,
  headerString,
  isTraceparent,
  kafkaRecordFor,
  messageHeaders,
  rabbitPublishOptions,
  runInMessageContext,
  type OutboxRow,
} from "./envelope";
import { InvalidEnvelopeError, isPermanentError } from "./errors";

const row = (overrides: Partial<OutboxRow> = {}): OutboxRow => ({
  id: "0190a3a4-0000-7000-8000-000000000001",
  kind: "event",
  name: "StockAdjusted",
  aggregateType: "StockItem",
  aggregateId: "sku-1",
  payload: { sku: "sku-1", onHand: 1 },
  correlationId: "corr-1",
  causationId: "cause-1",
  traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
  createdAt: new Date("2026-09-17T10:00:00.000Z"),
  attempts: 0,
  ...overrides,
});

describe("envelope building and header mapping", () => {
  it("builds the envelope from an outbox row (messageId = row id)", () => {
    expect(buildEnvelope(row(), "inventory-service")).toEqual({
      messageId: "0190a3a4-0000-7000-8000-000000000001",
      kind: "event",
      name: "StockAdjusted",
      version: 1,
      occurredAt: "2026-09-17T10:00:00.000Z",
      producer: "inventory-service",
      correlationId: "corr-1",
      causationId: "cause-1",
      aggregateType: "StockItem",
      aggregateId: "sku-1",
      payload: { sku: "sku-1", onHand: 1 },
    });
    expect(() => buildEnvelope(row({ kind: "query" }), "x")).toThrow(InvalidEnvelopeError);
  });

  it("kafka record: key = aggregateId, falling back to messageId; contract headers set", () => {
    const envelope = buildEnvelope(row(), "svc");
    const record = kafkaRecordFor(envelope, row().traceparent);
    expect(record.key).toBe("sku-1");
    expect(JSON.parse(record.value)).toEqual(envelope);
    expect(record.headers).toEqual({
      [MessageHeaders.messageId]: envelope.messageId,
      [MessageHeaders.messageName]: "StockAdjusted",
      [MessageHeaders.correlationId]: "corr-1",
      [MessageHeaders.causationId]: "cause-1",
      [MessageHeaders.traceparent]: row().traceparent,
    });
    const noAggregate = kafkaRecordFor(buildEnvelope(row({ aggregateId: null, causationId: null, traceparent: null }), "svc"));
    expect(noAggregate.key).toBe(envelope.messageId);
    expect(noAggregate.headers).not.toHaveProperty(MessageHeaders.causationId);
    expect(noAggregate.headers).not.toHaveProperty(MessageHeaders.traceparent);
  });

  it("rabbit publish options: persistent, mandatory, ids, type and headers", () => {
    const envelope = buildEnvelope(row({ kind: "command", name: "payment.refund", aggregateId: null }), "checkout-service");
    const options = rabbitPublishOptions(envelope, "garbage-traceparent");
    expect(options).toMatchObject({ persistent: true, mandatory: true, messageId: envelope.messageId, correlationId: "corr-1", type: "payment.refund", appId: "checkout-service", contentType: "application/json" });
    expect(options.headers).toEqual(messageHeaders(envelope));
    expect(options.timestamp).toBe(Math.floor(Date.parse("2026-09-17T10:00:00.000Z") / 1000));
  });

  it("decodes a valid envelope and rejects malformed bodies with a permanent error", () => {
    const envelope = buildEnvelope(row(), "svc");
    expect(decodeEnvelope(Buffer.from(JSON.stringify(envelope)))).toEqual(envelope);
    for (const body of [null, Buffer.from(""), "not json", "[]", JSON.stringify({ ...envelope, messageId: "" }), JSON.stringify({ ...envelope, kind: "query" })]) {
      let caught: unknown;
      try {
        decodeEnvelope(body);
      } catch (error) {
        caught = error;
      }
      expect(isPermanentError(caught)).toBe(true);
    }
  });

  it("header helpers read Kafka buffers, arrays and AMQP numbers", () => {
    const headers = { a: Buffer.from("buf"), b: ["first", "second"], c: 4, d: "7", e: "x7", f: undefined };
    expect(headerString(headers, "a")).toBe("buf");
    expect(headerString(headers, "b")).toBe("first");
    expect(headerInt(headers, "c")).toBe(4);
    expect(headerInt(headers, "d")).toBe(7);
    expect(headerInt(headers, "e")).toBe(0);
    expect(headerInt(headers, "missing")).toBe(0);
  });

  it("traceparent header is validated and formatted from a span context", () => {
    expect(isTraceparent("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")).toBe(true);
    expect(isTraceparent("00-00000000000000000000000000000000-b7ad6b7169203331-01")).toBe(false);
    expect(isTraceparent("nope")).toBe(false);
    expect(formatTraceparent({ traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", traceFlags: TraceFlags.SAMPLED })).toBe("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    expect(formatTraceparent(trace.getSpanContext(ROOT_CONTEXT) ?? { traceId: "0", spanId: "0", traceFlags: 0 })).toBeNull();
  });

  it("consumer context takes correlation from headers and sets causation to the handled messageId", async () => {
    const envelope = buildEnvelope(row(), "svc");
    const ctx = consumerContext(envelope, { [MessageHeaders.correlationId]: Buffer.from("header-corr") });
    expect(ctx).toEqual({ correlationId: "header-corr", messageId: envelope.messageId, traceparent: null });
    const seen = await runInMessageContext(ctx, async () => RequestContext.get());
    expect(seen).toMatchObject({ correlationId: "header-corr", causationId: envelope.messageId });
  });
});
