import { MessageHeaders, type MessageEnvelope } from "@meridian/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RequestContext } from "../core";
import { KitHeaders, buildDltMessage, buildReplayMessage, kafkaDeadLetterDto, kafkaDeadLetterId, parseKafkaDeadLetterId, rabbitDeadLetterDto, rabbitReplayHeaders } from "./dead-letters";
import { PermanentError } from "./errors";
import { processKafkaRecord, type KafkaRecordDeps } from "./kafka-processor";
import { processRabbitDelivery, type RabbitDeliveryDeps } from "./rabbit-processor";
import { HandlerRegistry, type KafkaHandlerRegistration, type RabbitHandlerRegistration } from "./registry";

const envelope = (overrides: Partial<MessageEnvelope> = {}): MessageEnvelope => ({
  messageId: "m-1",
  kind: "event",
  name: "StockAdjusted",
  version: 1,
  occurredAt: "2026-09-17T10:00:00.000Z",
  producer: "inventory-service",
  correlationId: "corr-env",
  causationId: null,
  aggregateType: "StockItem",
  aggregateId: "sku-1",
  payload: { sku: "sku-1" },
  ...overrides,
});

const kafkaRecord = (env = envelope(), headers: Record<string, string> = { [MessageHeaders.correlationId]: "corr-header" }) => ({
  topic: "meridian.inventory",
  partition: 2,
  message: { key: Buffer.from("sku-1"), value: Buffer.from(JSON.stringify(env)), offset: "41", timestamp: "1789630000000", headers },
});

const noSleep: KafkaRecordDeps["sleep"] = async (_ms, shouldStop) => !shouldStop();

function kafkaDeps(handle: KafkaHandlerRegistration["handle"], overrides: Partial<KafkaRecordDeps> = {}) {
  const dead: Array<ReturnType<typeof buildDltMessage>> = [];
  const deps: KafkaRecordDeps = {
    group: "search-indexer",
    handlers: [{ group: "search-indexer", events: ["StockAdjusted"], name: "h", handle }],
    delaysMs: [100, 200, 300],
    isActive: () => true,
    heartbeat: async () => undefined,
    deadLetter: async (message) => void dead.push(message),
    sleep: noSleep,
    now: () => new Date("2026-09-17T10:05:00.000Z"),
    ...overrides,
  };
  return { deps, dead };
}

describe("kafka consumer record processing", () => {
  beforeEach(() => {
    delete process.env.CHAOS_ENABLED;
  });

  it("runs the handler inside RequestContext with correlation from the record header and causation = messageId", async () => {
    let seen: unknown;
    let meta: unknown;
    const { deps } = kafkaDeps(async (_env, m) => {
      seen = RequestContext.get();
      meta = m;
    });
    expect(await processKafkaRecord(kafkaRecord(), deps)).toEqual({ result: "success", attempts: 1 });
    expect(seen).toMatchObject({ correlationId: "corr-header", causationId: "m-1" });
    expect(meta).toEqual({ topic: "meridian.inventory", partition: 2, offset: "41", attempt: 1, maxAttempts: 4 });
  });

  it("retries in-process with the configured delays, then parks the record on the dead letter topic (DLT) with failure headers", async () => {
    const waits: number[] = [];
    let calls = 0;
    const { deps, dead } = kafkaDeps(
      async () => {
        calls += 1;
        throw new Error(`boom ${calls}`);
      },
      {
        sleep: async (ms) => {
          waits.push(ms);
          return true;
        },
      },
    );
    const outcome = await processKafkaRecord(kafkaRecord(), deps);
    expect(outcome).toEqual({ result: "dead-letter", attempts: 4, lastError: "boom 4" });
    expect(waits).toEqual([100, 200, 300]);
    expect(dead).toHaveLength(1);
    expect(dead[0].key?.toString()).toBe("sku-1");
    expect(dead[0].headers).toMatchObject({
      [MessageHeaders.attempts]: "4",
      [MessageHeaders.lastError]: "boom 4",
      [MessageHeaders.originalTopic]: "meridian.inventory",
      [MessageHeaders.consumerGroup]: "search-indexer",
      [MessageHeaders.firstFailedAt]: "2026-09-17T10:05:00.000Z",
      [MessageHeaders.correlationId]: "corr-header",
      [KitHeaders.originalPartition]: "2",
      [KitHeaders.originalOffset]: "41",
    });
  });

  it("a permanent error goes to the DLT without retries; an undecodable record too", async () => {
    const { deps, dead } = kafkaDeps(async () => {
      throw new PermanentError("invalid payload");
    });
    expect(await processKafkaRecord(kafkaRecord(), deps)).toMatchObject({ result: "dead-letter", attempts: 1 });
    const garbage = { ...kafkaRecord(), message: { ...kafkaRecord().message, value: Buffer.from("{not json") } };
    expect(await processKafkaRecord(garbage, deps)).toMatchObject({ result: "dead-letter", attempts: 1 });
    expect(dead.map((d) => d.headers[MessageHeaders.attempts])).toEqual(["1", "1"]);
  });

  it("skips events the group does not handle (offset still committed by the caller)", async () => {
    const { deps, dead } = kafkaDeps(async () => {
      throw new Error("must not run");
    });
    expect(await processKafkaRecord(kafkaRecord(envelope({ name: "OrderPaid" })), deps)).toEqual({ result: "skipped", attempts: 0 });
    expect(dead).toHaveLength(0);
  });

  it("aborts retries without a DLT write when the partition is revoked during a retry wait", async () => {
    let active = true;
    const { deps, dead } = kafkaDeps(
      async () => {
        active = false;
        throw new Error("transient");
      },
      { isActive: () => active },
    );
    expect(await processKafkaRecord(kafkaRecord(), deps)).toMatchObject({ result: "aborted", attempts: 1 });
    expect(dead).toHaveLength(0);
  });
});

const registration = (handle: RabbitHandlerRegistration["handle"]): RabbitHandlerRegistration => ({ command: "notification.send-email", prefetch: 10, name: "h", handle });

const delivery = (headers: Record<string, unknown> = {}) => ({
  content: Buffer.from(JSON.stringify(envelope({ kind: "command", name: "notification.send-email", aggregateId: null }))),
  properties: { messageId: "m-1", correlationId: "corr-env", type: "notification.send-email", contentType: "application/json", headers: { [MessageHeaders.correlationId]: "corr-env", ...headers } },
});

function rabbitDeps(handle: RabbitHandlerRegistration["handle"], overrides: Partial<RabbitDeliveryDeps> = {}) {
  const log: string[] = [];
  const published: Array<{ exchange: string; routingKey: string; headers: Record<string, unknown> }> = [];
  const deps: RabbitDeliveryDeps = {
    registration: registration(handle),
    delaysMs: [300, 600, 900],
    publish: async (exchange, routingKey, _content, options) => {
      log.push("publish");
      published.push({ exchange, routingKey, headers: options.headers });
    },
    ack: () => void log.push("ack"),
    nack: (requeue) => void log.push(`nack:${requeue}`),
    now: () => new Date("2026-09-17T11:00:00.000Z"),
    ...overrides,
  };
  return { deps, log, published };
}

describe("rabbit command delivery processing", () => {
  afterEach(() => {
    delete process.env.MESSAGING_NAMESPACE;
  });

  it("acks after the handler settles; attempt 1 on first delivery", async () => {
    let meta: unknown;
    const { deps, log } = rabbitDeps(async (_env, m) => {
      meta = m;
      expect(log).toEqual([]);
    });
    expect(await processRabbitDelivery(delivery(), deps)).toEqual({ result: "success", attempts: 1 });
    expect(log).toEqual(["ack"]);
    expect(meta).toEqual({ attempt: 1, maxAttempts: 4 });
  });

  it("a failed delivery is republished to its retry tier (confirmed) before the original is acked", async () => {
    const { deps, log, published } = rabbitDeps(async () => {
      throw new Error("smtp down");
    });
    expect(await processRabbitDelivery(delivery(), deps)).toMatchObject({ result: "retry", attempts: 1 });
    expect(log).toEqual(["publish", "ack"]);
    expect(published[0]).toMatchObject({ exchange: "meridian.retry", routingKey: "notification.send-email.retry.300ms" });
    expect(published[0].headers).toMatchObject({ [MessageHeaders.attempts]: 1, [MessageHeaders.lastError]: "smtp down", [MessageHeaders.firstFailedAt]: "2026-09-17T11:00:00.000Z" });
  });

  it("the 4th failed delivery goes to the dead letter queue with attempts 4 and the original first-failure time", async () => {
    const seen: unknown[] = [];
    const { deps, published } = rabbitDeps(
      async () => {
        throw new Error("still down");
      },
      { onDeadLetter: (_env, info) => void seen.push(info) },
    );
    const outcome = await processRabbitDelivery(delivery({ [MessageHeaders.attempts]: 3, [MessageHeaders.firstFailedAt]: "2026-09-17T10:59:00.000Z", "x-death": [{ count: 3 }] }), deps);
    expect(outcome).toMatchObject({ result: "dead-letter", attempts: 4 });
    expect(published[0]).toMatchObject({ exchange: "meridian.dlx", routingKey: "notification.send-email" });
    expect(published[0].headers).toMatchObject({ [MessageHeaders.attempts]: 4, [MessageHeaders.firstFailedAt]: "2026-09-17T10:59:00.000Z", [MessageHeaders.lastError]: "still down" });
    expect(published[0].headers[KitHeaders.deadLetterId]).toEqual(expect.any(String));
    expect(published[0].headers).not.toHaveProperty("x-death");
    expect(seen).toEqual([{ queue: "notification.send-email.dlq", attempts: 4, lastError: "still down", permanent: false }]);
  });

  it("a PermanentError skips the retry tiers and goes straight to the DLQ", async () => {
    const { deps, published } = rabbitDeps(async () => {
      throw new PermanentError("template unknown");
    });
    expect(await processRabbitDelivery(delivery(), deps)).toMatchObject({ result: "dead-letter", attempts: 1 });
    expect(published[0].routingKey).toBe("notification.send-email");
    expect(published[0].exchange).toBe("meridian.dlx");
  });

  it("requeues the original when the retry copy cannot be published, so nothing is lost", async () => {
    const { deps, log } = rabbitDeps(
      async () => {
        throw new Error("fail");
      },
      {
        publish: async () => {
          throw new Error("channel closed");
        },
      },
    );
    expect(await processRabbitDelivery(delivery(), deps)).toMatchObject({ result: "requeued" });
    expect(log).toEqual(["nack:true"]);
  });
});

describe("dead letter records, ids and replay headers", () => {
  it("kafka dead letter id round-trips partition and offset", () => {
    const id = kafkaDeadLetterId(1, { offset: "12", timestamp: "1789630000000" });
    expect(id).toBe("k-1-12-1789630000000");
    expect(parseKafkaDeadLetterId(id)).toEqual({ partition: 1, offset: 12n });
    expect(parseKafkaDeadLetterId("garbage")).toBeNull();
  });

  it("DLT record dto exposes attempts and error; replay record strips failure headers but keeps the original topic", () => {
    const source = kafkaRecord();
    const dlt = buildDltMessage(source, { group: "g", attempts: 4, lastError: "ChaosError: Injected fail", firstFailedAt: new Date("2026-09-17T10:00:00Z") });
    const stored = { key: dlt.key, value: dlt.value, offset: "0", timestamp: "1789630000000", headers: dlt.headers };
    expect(kafkaDeadLetterDto("meridian.dlt.g", 0, stored)).toEqual({
      id: "k-0-0-1789630000000",
      source: "kafka",
      queueOrTopic: "meridian.dlt.g",
      name: "StockAdjusted",
      messageId: "m-1",
      correlationId: "corr-header",
      attempts: 4,
      lastError: "ChaosError: Injected fail",
      firstFailedAt: "2026-09-17T10:00:00.000Z",
      payload: { sku: "sku-1" },
    });
    const replay = buildReplayMessage("meridian.dlt.g", "k-0-0-1789630000000", stored);
    expect(replay.headers).not.toHaveProperty(MessageHeaders.attempts);
    expect(replay.headers).not.toHaveProperty(MessageHeaders.lastError);
    expect(replay.headers[MessageHeaders.originalTopic]).toBe("meridian.inventory");
    expect(replay.headers[KitHeaders.replayedFrom]).toBe("meridian.dlt.g/k-0-0-1789630000000");
    const again = buildDltMessage({ topic: "meridian.replay.g", partition: 0, message: { ...stored, headers: replay.headers } }, { group: "g", attempts: 1, lastError: "x", firstFailedAt: new Date() });
    expect(again.headers[MessageHeaders.originalTopic]).toBe("meridian.inventory");
  });

  it("rabbit DLQ message dto and replay headers reset attempts", () => {
    const message = delivery({ [MessageHeaders.attempts]: 4, [MessageHeaders.lastError]: "boom", [KitHeaders.deadLetterId]: "dl-1", "x-death": [{}] });
    expect(rabbitDeadLetterDto("q.dlq", message)).toMatchObject({ id: "dl-1", source: "rabbit", messageId: "m-1", attempts: 4, lastError: "boom", name: "notification.send-email" });
    const headers = rabbitReplayHeaders(message.properties.headers, "dl-1", "q.dlq");
    expect(headers).not.toHaveProperty(MessageHeaders.attempts);
    expect(headers).not.toHaveProperty("x-death");
    expect(headers).toMatchObject({ [MessageHeaders.correlationId]: "corr-env", [KitHeaders.replayedFrom]: "q.dlq/dl-1" });
  });
});

describe("handler registry", () => {
  it("validates handler options and allows one handler per command queue", () => {
    const registry = new HandlerRegistry();
    expect(() => registry.registerKafka({ group: "g", events: ["Nope" as never] }, async () => undefined)).toThrow(/unknown event/);
    expect(() => registry.registerRabbit({ command: "x.y" as never }, async () => undefined)).toThrow(/unknown command/);
    registry.registerKafka({ group: "g", events: ["StockAdjusted"] }, async () => undefined);
    registry.registerKafka({ group: "g", events: ["StockAdjusted", "OrderPaid"] }, async () => undefined);
    expect(registry.kafkaGroups().get("g")?.events).toEqual(["StockAdjusted", "OrderPaid"]);
    const unregister = registry.registerRabbit({ command: "payment.void" }, async () => undefined);
    expect(() => registry.registerRabbit({ command: "payment.void" }, async () => undefined)).toThrow(/already handled/);
    unregister();
    expect(registry.rabbitHandlers()).toHaveLength(0);
  });
});
