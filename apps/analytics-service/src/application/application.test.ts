import type { EventEnvelope } from "@meridian/contracts";
import { FixedClock } from "@meridian/kernel";
import { describe, expect, it } from "vitest";
import { FakeProjectorControl, InMemoryAnalyticsStore } from "../test-support/in-memory";
import { ProjectOrderFactCommand, ProjectOrderFactHandler, RebuildProjectionsCommand, RebuildProjectionsHandler } from "./commands";
import { AnalyticsProjectorConsumer, toOrderFact } from "./event-handlers";
import { GetAnalyticsOverviewHandler, GetAnalyticsOverviewQuery, GetTopProductsHandler, GetTopProductsQuery, UNKNOWN_LAG } from "./queries";

const now = "2026-09-17T12:00:00.000Z";
const clock = new FixedClock(new Date(now));
let seq = 0;
const envelope = (name: string, payload: object, messageId = `m-${++seq}`): EventEnvelope =>
  ({ messageId, kind: "event", name, version: 1, occurredAt: now, producer: "test", correlationId: "c", causationId: null, aggregateType: "Order", aggregateId: "x", payload }) as unknown as EventEnvelope;
const line = (sku: string, slug: string, qty: number, unit: number) => ({ sku, slug, productName: slug, variantLabel: "v", qty, unitPriceCents: unit, lineTotalCents: qty * unit });
const pricing = (totalCents: number) => ({ subtotalCents: totalCents, discountCents: 0, shippingCents: 0, taxCents: 0, taxRatePercent: 20, totalCents, currency: "EUR" });
const placed = (orderId: string, total: number) => envelope("OrderPlaced", { orderId, number: "M-1", lines: [], pricing: pricing(total), placedAt: now });
const paid = (orderId: string, total: number, lines: object[]) => envelope("OrderPaid", { orderId, number: "M-1", lines, pricing: pricing(total), paymentId: "p", paidAt: now });

/** Wires the consumer → CommandBus → handler path without Nest. */
function setup() {
  const store = new InMemoryAnalyticsStore();
  const control = new FakeProjectorControl();
  const project = new ProjectOrderFactHandler(store);
  const rebuild = new RebuildProjectionsHandler(control, store);
  const bus = { execute: (command: unknown) => (command instanceof ProjectOrderFactCommand ? project.execute(command) : rebuild.execute(command as RebuildProjectionsCommand)) };
  const consumer = new AnalyticsProjectorConsumer(bus as never);
  const overview = new GetAnalyticsOverviewHandler(store, control, clock);
  const top = new GetTopProductsHandler(store, clock);
  return { store, control, project, rebuild, consumer, overview, top };
}

async function feedProbeScenario(consumer: AnalyticsProjectorConsumer) {
  const linesA = [line("HOLT-CHA", "holt-sofa", 1, 240000)];
  const linesB = [line("KITE-OCH", "kite-lamp", 2, 54000), line("HOLT-OAT", "holt-sofa", 1, 240000)];
  const log = [
    placed("o1", 240000),
    placed("o2", 348000),
    placed("o3", 240000),
    paid("o1", 240000, linesA),
    paid("o2", 348000, linesB),
    envelope("OrderCancelled", { orderId: "o3", number: "M-3", reason: "expired", refundRequired: false, totalCents: 240000, cancelledAt: now }),
    envelope("OrderRefunded", { orderId: "o2", number: "M-2", refundId: "r1", amountCents: 54000, totalRefundedCents: 54000, full: false, reason: "return" }),
  ];
  for (const e of log) await consumer.project(e);
  return log;
}

describe("projection (Kafka consumer → ProjectOrderFactCommand)", () => {
  it("builds daily sales, cancellations and conversion for the overview", async () => {
    const { consumer, overview } = setup();
    await feedProbeScenario(consumer);
    const result = await overview.execute(new GetAnalyticsOverviewQuery(30));
    expect(result.totals).toEqual({ ordersPlaced: 3, ordersPaid: 2, ordersCancelled: 1, grossCents: 588000, refundsCents: 54000, netCents: 534000, averageOrderCents: 294000, conversionRate: 2 / 3 });
    expect(result.daily).toHaveLength(30);
    expect(result.daily.at(-1)).toEqual({ day: "2026-09-17", ordersPlaced: 3, ordersPaid: 2, grossCents: 588000, refundsCents: 54000 });
    expect(result.cancellations).toEqual([{ reason: "expired", count: 1 }]);
    expect(result.projectionLag).toBe(0);
    expect(result.lastEventAt).toBe(now);
  });

  it("a duplicate delivery of the same messageId is idempotent: OrderPaid counts once", async () => {
    const { consumer, project, overview, store } = setup();
    const event = paid("o1", 1000, [line("A", "a", 1, 1000)]);
    await consumer.project(event);
    await consumer.project(event);
    const fact = toOrderFact(event);
    expect(await project.execute(new ProjectOrderFactCommand(fact.messageId, fact.fact, fact.occurredAt))).toBe("duplicate");
    expect((await overview.execute(new GetAnalyticsOverviewQuery(30))).totals.ordersPaid).toBe(1);
    expect(store.inbox.size).toBe(1);
  });

  it("the same business fact re-published under a new messageId is not double counted (idempotent per order)", async () => {
    const { consumer, overview } = setup();
    await consumer.project(paid("o1", 1000, [line("A", "a", 1, 1000)]));
    await consumer.project(paid("o1", 1000, [line("A", "a", 1, 1000)]));
    expect((await overview.execute(new GetAnalyticsOverviewQuery(30))).totals).toMatchObject({ ordersPaid: 1, grossCents: 1000 });
  });

  it("a failed projection transaction leaves no inbox row, so the retry projects it", async () => {
    const { consumer, store, overview } = setup();
    store.failNextWork = new Error("db down");
    const event = placed("o1", 500);
    await expect(consumer.project(event)).rejects.toThrow("db down");
    await consumer.project(event);
    expect((await overview.execute(new GetAnalyticsOverviewQuery(30))).totals.ordersPlaced).toBe(1);
  });

  it("top products count only paid order lines, grouped by product", async () => {
    const { consumer, top } = setup();
    await feedProbeScenario(consumer);
    await consumer.project(placed("o9", 240000));
    expect(await top.execute(new GetTopProductsQuery(30, 5))).toEqual([
      { sku: "HOLT-CHA", slug: "holt-sofa", productName: "holt-sofa", units: 2, revenueCents: 480000 },
      { sku: "KITE-OCH", slug: "kite-lamp", productName: "kite-lamp", units: 2, revenueCents: 108000 },
    ]);
  });

  it("events outside the reporting window are excluded; payment failures are tracked but not revenue", async () => {
    const { consumer, overview, store } = setup();
    await consumer.project(envelope("OrderPlaced", { orderId: "old", pricing: pricing(100), placedAt: "2026-01-01T00:00:00.000Z" }));
    await consumer.project(envelope("PaymentFailed", { paymentId: "p", orderId: "o5", transactionId: "t", reason: "declined" }));
    const result = await overview.execute(new GetAnalyticsOverviewQuery(7));
    expect(result.totals.ordersPlaced).toBe(0);
    expect(result.totals.grossCents).toBe(0);
    expect(store.daily.get("2026-09-17")?.paymentsFailed).toBe(1);
  });

  it("invalid payloads are permanent errors (straight to the DLT, no retries)", async () => {
    const { consumer } = setup();
    await expect(consumer.project(envelope("OrderPaid", { orderId: "o1", lines: "nope" }))).rejects.toMatchObject({ permanent: true });
    await expect(consumer.project(envelope("OrderPlaced", { orderId: "o1", pricing: pricing(-5), placedAt: now }))).rejects.toMatchObject({ permanent: true });
    await expect(consumer.project(envelope("OrderShipped", { orderId: "o1" }))).rejects.toMatchObject({ permanent: true });
  });

  it("reports unknown projection lag as -1 when the broker does not answer", async () => {
    const { control, overview } = setup();
    control.currentLag = null;
    expect((await overview.execute(new GetAnalyticsOverviewQuery(30))).projectionLag).toBe(UNKNOWN_LAG);
    control.currentLag = 7;
    expect((await overview.execute(new GetAnalyticsOverviewQuery(30))).projectionLag).toBe(7);
  });
});

describe("rebuild (replay the log)", () => {
  it("pauses, resets offsets before truncating, resumes, and replaying the log reproduces the same totals", async () => {
    const { consumer, control, rebuild, overview, store } = setup();
    const log = await feedProbeScenario(consumer);
    const before = await overview.execute(new GetAnalyticsOverviewQuery(30));
    const result = await rebuild.execute(new RebuildProjectionsCommand("admin"));
    expect(result.status).toBe("replaying");
    expect(control.calls).toEqual(["pause", "reset", "resume"]);
    expect(store.truncations).toBe(1);
    expect((await overview.execute(new GetAnalyticsOverviewQuery(30))).totals.ordersPlaced).toBe(0);
    for (const e of log) await consumer.project(e); // the replay redelivers the same messageIds
    expect((await overview.execute(new GetAnalyticsOverviewQuery(30))).totals).toEqual(before.totals);
  });

  it("a failed offset reset keeps the read model and still resumes the projector", async () => {
    const { consumer, control, rebuild, store, overview } = setup();
    await feedProbeScenario(consumer);
    control.failOn = "resetToEarliest";
    await expect(rebuild.execute(new RebuildProjectionsCommand("admin"))).rejects.toThrow("group still active");
    expect(control.calls).toEqual(["pause", "reset", "resume"]);
    expect(store.truncations).toBe(0);
    expect((await overview.execute(new GetAnalyticsOverviewQuery(30))).totals.ordersPlaced).toBe(3);
  });

  it("rejects a concurrent rebuild with CONFLICT", async () => {
    const { control, rebuild } = setup();
    let release!: () => void;
    control.gate = new Promise((resolve) => (release = resolve));
    const first = rebuild.execute(new RebuildProjectionsCommand("a"));
    await expect(rebuild.execute(new RebuildProjectionsCommand("b"))).rejects.toMatchObject({ code: "CONFLICT" });
    release();
    await first;
    await expect(rebuild.execute(new RebuildProjectionsCommand("c"))).resolves.toMatchObject({ status: "replaying" });
  });
});
