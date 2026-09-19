import { describe, expect, it } from "vitest";
import { OrderActivity } from "./order-activity";
import { ReportingWindow } from "./reporting-window";
import { SalesReport } from "./sales-report";
import { rankTopProducts } from "./top-products";
import { UtcDay } from "./utc-day";

const at = new Date("2026-09-17T10:00:00.000Z");
const line = (sku: string, slug: string, qty: number, unit: number) => ({ sku, slug, productName: slug, qty, lineTotalCents: qty * unit });

describe("UtcDay and ReportingWindow", () => {
  it("attributes a timestamp to its UTC calendar day, not the local one", () => {
    expect(UtcDay.fromIso("2026-09-17T23:59:59.999-02:00").value).toBe("2026-09-18");
    expect(UtcDay.parse("2026-02-28").plusDays(1).value).toBe("2026-03-01");
    expect(() => UtcDay.parse("2026-02-30")).toThrow();
  });

  it("covers the last N days including today and rejects invalid day counts", () => {
    const window = ReportingWindow.lastDays(30, at);
    expect(window.from.value).toBe("2026-08-19");
    expect(window.to.value).toBe("2026-09-17");
    expect(window.eachDay()).toHaveLength(30);
    expect(window.contains("2026-08-18")).toBe(false);
    expect(() => ReportingWindow.lastDays(0, at)).toThrow(/days/);
    expect(() => ReportingWindow.lastDays(400, at)).toThrow(/days/);
  });
});

describe("OrderActivity", () => {
  it("counts a placed order once on its placement day even when the fact is re-published (duplicate)", () => {
    const order = OrderActivity.start("o1");
    const first = order.apply({ kind: "placed", orderId: "o1", at, totalCents: 1000 });
    expect(first.daily()).toEqual([expect.objectContaining({ day: "2026-09-17", ordersPlaced: 1, placedCents: 1000 })]);
    expect(order.apply({ kind: "placed", orderId: "o1", at, totalCents: 1000 }).isEmpty()).toBe(true);
  });

  it("adds gross and the paid lines to daily sales and product sales once per order", () => {
    const order = OrderActivity.start("o1");
    const paid = { kind: "paid" as const, orderId: "o1", at, totalCents: 348000, lines: [line("KITE-OCH", "kite-lamp", 2, 54000), line("HOLT-OAT", "holt-sofa", 1, 240000)] };
    const delta = order.apply(paid);
    expect(delta.daily()[0]).toMatchObject({ ordersPaid: 1, grossCents: 348000 });
    expect(delta.products().map((p) => [p.sku, p.units, p.revenueCents])).toEqual([
      ["HOLT-OAT", 1, 240000],
      ["KITE-OCH", 2, 108000],
    ]);
    expect(order.apply(paid).isEmpty()).toBe(true);
  });

  it("counts refunds from the cumulative refunded total so duplicates and partial refunds add up exactly", () => {
    const order = OrderActivity.start("o1");
    expect(order.apply({ kind: "refunded", orderId: "o1", at, amountCents: 5000, totalRefundedCents: 5000 }).daily()[0].refundsCents).toBe(5000);
    expect(order.apply({ kind: "refunded", orderId: "o1", at, amountCents: 5000, totalRefundedCents: 5000 }).isEmpty()).toBe(true);
    expect(order.apply({ kind: "refunded", orderId: "o1", at, amountCents: 2000, totalRefundedCents: 7000 }).daily()[0].refundsCents).toBe(2000);
    expect(order.snapshot().refundedCents).toBe(7000);
  });

  it("records cancellations by reason once and rejects facts for another order or negative amounts", () => {
    const order = OrderActivity.start("o1");
    expect(order.apply({ kind: "cancelled", orderId: "o1", at, reason: "expired" }).cancellations()).toEqual([{ day: "2026-09-17", reason: "expired" }]);
    expect(order.apply({ kind: "cancelled", orderId: "o1", at, reason: "customer" }).isEmpty()).toBe(true);
    expect(() => order.apply({ kind: "placed", orderId: "o2", at, totalCents: 1 })).toThrow(/another order/);
    expect(() => order.apply({ kind: "placed", orderId: "o1", at, totalCents: -1 })).toThrow(/cents/);
  });
});

describe("SalesReport", () => {
  it("derives net, average order value and conversion rate from daily rows", () => {
    const totals = SalesReport.totals([
      { day: "2026-09-16", ordersPlaced: 2, ordersPaid: 1, ordersCancelled: 1, grossCents: 240000, refundsCents: 0 },
      { day: "2026-09-17", ordersPlaced: 1, ordersPaid: 1, ordersCancelled: 0, grossCents: 348000, refundsCents: 54000 },
    ]);
    expect(totals).toEqual({ ordersPlaced: 3, ordersPaid: 2, ordersCancelled: 1, grossCents: 588000, refundsCents: 54000, netCents: 534000, averageOrderCents: 294000, conversionRate: 2 / 3 });
  });

  it("conversion is 0 with nothing placed, never above 1, and averages round to the cent", () => {
    expect(SalesReport.conversionRate(0, 0)).toBe(0);
    expect(SalesReport.conversionRate(3, 2)).toBe(1);
    expect(SalesReport.averageOrderCents(1000, 3)).toBe(333);
    expect(SalesReport.averageOrderCents(1000, 0)).toBe(0);
  });

  it("zero-fills daily rows and merges cancellations by reason", () => {
    const filled = SalesReport.fillDays(["2026-09-16", "2026-09-17"], [{ day: "2026-09-17", ordersPlaced: 1, ordersPaid: 0, ordersCancelled: 0, grossCents: 0, refundsCents: 0 }]);
    expect(filled.map((r) => [r.day, r.ordersPlaced])).toEqual([
      ["2026-09-16", 0],
      ["2026-09-17", 1],
    ]);
    expect(SalesReport.cancellationsByReason([{ reason: "expired", count: 1 }, { reason: "customer", count: 2 }, { reason: "expired", count: 2 }])).toEqual([
      { reason: "expired", count: 3 },
      { reason: "customer", count: 2 },
    ]);
  });
});

describe("rankTopProducts", () => {
  it("ranks top products by revenue across variants and days, representing each by its best-selling sku", () => {
    const ranked = rankTopProducts(
      [
        { sku: "KITE-OCH", slug: "kite-lamp", productName: "Kite", units: 2, revenueCents: 108000 },
        { sku: "HOLT-CHA", slug: "holt-sofa", productName: "Holt", units: 1, revenueCents: 240000 },
        { sku: "HOLT-OAT", slug: "holt-sofa", productName: "Holt", units: 2, revenueCents: 480000 },
        { sku: "PIN-1", slug: "pin", productName: "Pin", units: 9, revenueCents: 900 },
      ],
      2,
    );
    expect(ranked).toEqual([
      { sku: "HOLT-OAT", slug: "holt-sofa", productName: "Holt", units: 3, revenueCents: 720000 },
      { sku: "KITE-OCH", slug: "kite-lamp", productName: "Kite", units: 2, revenueCents: 108000 },
    ]);
    expect(() => rankTopProducts([], 0)).toThrow(/limit/);
  });
});
