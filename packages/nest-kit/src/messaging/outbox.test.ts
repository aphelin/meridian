import { describe, expect, it } from "vitest";
import { RequestContext } from "../core";
import type { OutboxRow } from "./envelope";
import { uuidv7 } from "./ids";
import { Inbox } from "./inbox";
import { OutboxWriter, buildOutboxInsert } from "./outbox-writer";
import type { PrismaLike, PrismaTx } from "./prisma";
import { OutboxBackoff, OutboxRelay, orderingKey } from "./relay";

type Call = { sql: string; values: unknown[] };

function fakeTx(rowsAffected: number | (() => number) = 1, queryRows: unknown[] = []) {
  const executed: Call[] = [];
  const queried: Call[] = [];
  const tx: PrismaTx = {
    async $executeRaw(query: TemplateStringsArray, ...values: unknown[]) {
      executed.push({ sql: query.join("?"), values });
      return typeof rowsAffected === "function" ? rowsAffected() : rowsAffected;
    },
    async $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]) {
      queried.push({ sql: query.join("?"), values });
      return queryRows as T;
    },
  };
  return { tx, executed, queried };
}

const stock = { sku: "A", onHand: 1, reserved: 0, available: 1, previousAvailable: 0, actorId: null, reason: "test" };

describe("outbox writer validation and insert", () => {
  it("outbox validation rejects unknown event names", () => {
    expect(() => buildOutboxInsert("event", "NotAnEvent", {}, { type: "X", id: "1" })).toThrow(/unknown event name/);
  });

  it("outbox validation rejects unknown commands, non-object payloads, blank aggregates and events without aggregate", () => {
    expect(() => buildOutboxInsert("command", "payment.explode", {})).toThrow(/unknown command name/);
    expect(() => buildOutboxInsert("command", "payment.void", [] as unknown)).toThrow(/JSON object/);
    expect(() => buildOutboxInsert("event", "StockAdjusted", stock, { type: "StockItem", id: " " })).toThrow(/aggregate.id/);
    expect(() => buildOutboxInsert("event", "StockAdjusted", stock)).toThrow(/require an aggregate/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => buildOutboxInsert("command", "payment.void", cyclic)).toThrow(/JSON-serializable/);
  });

  it("outbox writer inserts the contract columns with correlation and causation from RequestContext", async () => {
    const { tx, executed } = fakeTx();
    const writer = new OutboxWriter();
    const id = await RequestContext.run({ correlationId: "corr-http", causationId: "msg-parent" }, () => writer.event(tx, "StockAdjusted", { type: "StockItem", id: "A" }, stock));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toContain('INSERT INTO "Outbox" ("id", "kind", "name", "aggregateType", "aggregateId", "payload", "correlationId", "causationId", "traceparent", "createdAt", "attempts")');
    expect(executed[0].values).toEqual([id, "event", "StockAdjusted", "StockItem", "A", JSON.stringify(stock), "corr-http", "msg-parent", null]);
  });

  it("outbox command outside any context gets a fresh correlation id and no causation", async () => {
    const { tx, executed } = fakeTx();
    await new OutboxWriter().command(tx, "inventory.release-reservation", { orderId: "o1", reason: "expired" });
    const values = executed[0].values;
    expect(values[1]).toBe("command");
    expect(values[3]).toBeNull();
    expect(typeof values[6]).toBe("string");
    expect(values[7]).toBeNull();
  });

  it("outbox ids are time-ordered UUIDv7 so same-transaction rows keep their order", () => {
    const ids = Array.from({ length: 50 }, () => uuidv7(1_800_000_000_000));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(50);
    expect(uuidv7(1_800_000_000_001) > ids[49]).toBe(true);
  });
});

describe("inbox dedupe", () => {
  it("inbox runs the work only when the (messageId, consumer) row was inserted", async () => {
    const { tx, executed } = fakeTx(1);
    let ran = 0;
    expect(await Inbox.once(tx, "search-indexer", "m-1", async () => void ran++)).toBe(true);
    expect(ran).toBe(1);
    expect(executed[0].sql).toContain('INSERT INTO "Inbox"');
    expect(executed[0].sql).toContain("ON CONFLICT DO NOTHING");
    expect(executed[0].values).toEqual(["m-1", "search-indexer"]);
  });

  it("inbox skips the work for a duplicate delivery", async () => {
    const { tx } = fakeTx(0);
    let ran = 0;
    expect(await Inbox.once(tx, "search-indexer", "m-1", () => void ran++)).toBe(false);
    expect(ran).toBe(0);
    await expect(Inbox.once(tx, "", "m-1", () => undefined)).rejects.toThrow(/consumer/);
  });
});

const outboxRow = (id: string, overrides: Partial<OutboxRow> = {}): OutboxRow => ({
  id,
  kind: "event",
  name: "StockAdjusted",
  aggregateType: "StockItem",
  aggregateId: `agg-${id}`,
  payload: stock,
  correlationId: "c",
  causationId: null,
  traceparent: null,
  createdAt: new Date(),
  attempts: 0,
  ...overrides,
});

describe("outbox relay", () => {
  it("outbox backoff excludes failing rows and blocks later rows of the same aggregate", () => {
    let now = 1000;
    const backoff = new OutboxBackoff(() => now);
    expect(backoff.fail({ id: "r1", attempts: 2 }, "StockItem:A")).toBe(4000);
    expect(backoff.excludedIds()).toEqual(["r1"]);
    expect(backoff.blockedKeys()).toEqual(new Set(["StockItem:A"]));
    now = 5001;
    expect(backoff.excludedIds()).toEqual([]);
    expect(backoff.blockedKeys().size).toBe(0);
    expect(orderingKey({ kind: "command", aggregateType: null, aggregateId: "x" })).toBeNull();
  });

  it("outbox relay publishes events and commands, marks them published and records failures with backoff", async () => {
    const rows = [outboxRow("e1"), outboxRow("e2", { name: "OrderPaid", aggregateType: "Order" }), outboxRow("c1", { kind: "command", name: "payment.void", aggregateId: null }), outboxRow("c2", { kind: "command", name: "payment.refund", aggregateId: null })];
    const { tx, executed, queried } = fakeTx(1, rows);
    const prisma = { ...tx, $transaction: async (fn: (t: PrismaTx) => Promise<unknown>) => fn(tx) } as unknown as PrismaLike;
    const sent: Array<{ topic: string; keys: unknown[] }> = [];
    const kafka = { send: async (topic: string, messages: Array<{ key: unknown }>) => void sent.push({ topic, keys: messages.map((m) => m.key) }) };
    const published: string[] = [];
    const rabbit = {
      ensureCommandTopology: async () => undefined,
      publishCommand: async (envelope: { name: string }) => {
        if (envelope.name === "payment.refund") throw new Error("broker nacked");
        published.push(envelope.name);
      },
    };
    const relay = new OutboxRelay(() => prisma, kafka as never, rabbit as never);
    expect(await relay.tick()).toBe(4);
    expect(queried[0].sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(queried[0].values[0]).toEqual([]);
    expect(sent).toEqual([
      { topic: "meridian.inventory", keys: ["agg-e1"] },
      { topic: "meridian.checkout", keys: ["agg-e2"] },
    ]);
    expect(published).toEqual(["payment.void"]);
    const markPublished = executed.find((call) => call.sql.includes('SET "publishedAt"'));
    expect(markPublished?.values[0]).toEqual(["e1", "e2", "c1"]);
    const failure = executed.find((call) => call.sql.includes('"attempts" = "attempts" + 1'));
    expect(failure?.values).toEqual(["broker nacked", "c2"]);

    await relay.tick();
    expect(queried[1].values[0]).toEqual(["c2"]);
  });
});
