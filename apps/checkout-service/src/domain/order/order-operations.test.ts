import type { OrderLineSnapshot, PricingBreakdown } from "@meridian/contracts";
import { describe, expect, it } from "vitest";
import { Order } from "./order";
import { trackingUrlFor } from "./tracking";

const t0 = new Date("2026-09-17T10:00:00Z");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);
const days = (n: number) => new Date(t0.getTime() + n * 86_400_000);
const lines: OrderLineSnapshot[] = [
  { sku: "HOLT-CHA-3", slug: "holt-sofa", productName: "Holt", variantLabel: "Charcoal wool", qty: 1, unitPriceCents: 240_000, lineTotalCents: 240_000 },
  { sku: "KITE-OCH", slug: "kite-lamp", productName: "Kite", variantLabel: "Ochre linen", qty: 2, unitPriceCents: 54_000, lineTotalCents: 108_000 },
];
const pricing: PricingBreakdown = { subtotalCents: 348_000, discountCents: 34_800, shippingCents: 0, taxCents: 50_007, taxRatePercent: 19, totalCents: 313_200, currency: "EUR" };
const TOTAL = 313_200;

function placed() {
  const order = Order.place({
    id: "order-1",
    number: "M-ABCDEFGH",
    customer: { userId: "user-1", email: "buyer@example.test", name: "Buyer" },
    shippingAddress: { fullName: "Buyer", line1: "1 Road", line2: null, city: "Berlin", postalCode: "10115", country: "DE", phone: null },
    shippingMethod: "standard",
    lines,
    pricing,
    couponCode: "NORTH-10",
    correlationId: "corr",
    holdMinutes: 15,
    now: t0,
  });
  order.pullEvents();
  return order;
}
function paid() {
  const order = placed();
  order.markPaid({ paymentId: "pay-1", transactionId: "txn-1", amountCents: TOTAL }, minutes(1));
  order.pullEvents();
  return order;
}
function delivered() {
  const order = paid();
  order.advanceFulfilment({ status: "fulfilling" }, minutes(2));
  order.advanceFulfilment({ status: "shipped", carrier: "DHL", trackingNumber: "JD0001" }, minutes(3));
  order.advanceFulfilment({ status: "delivered" }, days(2));
  order.pullEvents();
  return order;
}
const settle = (order: Order, refundId: string, amountCents: number, status: "succeeded" | "failed" = "succeeded", at = days(4)) =>
  order.recordRefundOutcome({ refundId, amountCents, status, reason: status === "failed" ? "card expired" : null }, at);

describe("Order cancellation", () => {
  it("cancel of a placed order releases the hold: no refund and no restock lines", () => {
    const order = placed();
    const outcome = order.cancel("customer", minutes(5));
    expect(outcome).toMatchObject({ wasPaid: false, refundRequired: false, refund: null, restockLines: [] });
    expect(order.pullEvents()).toEqual([expect.objectContaining({ name: "OrderCancelled", payload: expect.objectContaining({ reason: "customer", refundRequired: false }) })]);
  });

  it("cancel of a paid order in fulfilment opens a refund of the paid amount and restocks every line", () => {
    const order = paid();
    order.advanceFulfilment({ status: "fulfilling" }, minutes(2));
    const outcome = order.cancel("customer", minutes(10));
    expect(outcome.refund).toMatchObject({ amountCents: TOTAL, status: "pending", returnId: null, reason: "Order cancelled" });
    expect(outcome.restockLines).toEqual([{ sku: "HOLT-CHA-3", qty: 1 }, { sku: "KITE-OCH", qty: 2 }]);
    expect(order.snapshot()).toMatchObject({ status: "cancelled", cancellationReason: "customer", refunds: [expect.objectContaining({ status: "pending" })] });
    expect(order.pullEvents().map((e) => e.name)).toEqual(["OrderFulfilling", "OrderCancelled"]);
  });

  it("cancel refunds only what is not already refunded or pending", () => {
    const order = paid();
    const first = order.requestRefund({ amountCents: 13_200, reason: "goodwill" }, minutes(2));
    settle(order, first.id, 13_200, "succeeded", minutes(3));
    order.requestRefund({ amountCents: 100_000, reason: "pending one" }, minutes(4));
    expect(order.cancel("customer", minutes(5)).refund?.amountCents).toBe(200_000);
  });

  it("a cancelled order cannot be cancelled again (ORDER_NOT_CANCELLABLE)", () => {
    const order = placed();
    order.cancel("customer", minutes(1));
    expect(() => order.cancel("customer", minutes(2))).toThrow(expect.objectContaining({ code: "ORDER_NOT_CANCELLABLE" }));
    expect(order.actionsAt(minutes(2)).cancel).toBe(false);
  });

  it("a refund outcome for a cancelled paid order keeps it cancelled", () => {
    const order = paid();
    const { refund } = order.cancel("customer", minutes(5));
    expect(settle(order, refund!.id, TOTAL)).toBe(true);
    expect(order.snapshot()).toMatchObject({ status: "cancelled", refundedCents: TOTAL });
  });
});

describe("Order fulfilment and tracking", () => {
  it("shipping generates a carrier tracking url containing the tracking number", () => {
    const order = paid();
    order.advanceFulfilment({ status: "fulfilling" }, minutes(2));
    expect(order.advanceFulfilment({ status: "shipped", carrier: " DHL ", trackingNumber: " JD0001 " }, minutes(3))).toEqual({ from: "fulfilling", to: "shipped" });
    const { fulfillment } = order.snapshot();
    expect(fulfillment).toMatchObject({ carrier: "DHL", trackingNumber: "JD0001", shippedAt: minutes(3) });
    expect(fulfillment.trackingUrl).toMatch(/dhl\.com.*JD0001/);
  });

  it("tracking url falls back to a generic parcel search and encodes the number", () => {
    expect(trackingUrlFor("Local Courier", "A B/1")).toBe("https://parcelsapp.com/en/tracking/A%20B%2F1");
    expect(trackingUrlFor("ups", "1Z999")).toContain("tracknum=1Z999");
  });

  it("shipping without a tracking number is VALIDATION_FAILED and leaves the order fulfilling", () => {
    const order = paid();
    order.advanceFulfilment({ status: "fulfilling" }, minutes(2));
    expect(() => order.advanceFulfilment({ status: "shipped", carrier: "DHL" }, minutes(3))).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(order.status).toBe("fulfilling");
  });

  it("transition state machine rejects skipping or going back with INVALID_TRANSITION", () => {
    const order = paid();
    expect(() => order.advanceFulfilment({ status: "shipped", carrier: "DHL", trackingNumber: "1" }, minutes(2))).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
    const done = delivered();
    expect(() => done.advanceFulfilment({ status: "fulfilling" }, days(3))).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
  });

  it("fulfilment transitions write timeline entries and delivery events carry review lines", () => {
    const order = paid();
    order.advanceFulfilment({ status: "fulfilling" }, minutes(2));
    order.advanceFulfilment({ status: "shipped", carrier: "DPD", trackingNumber: "T1" }, minutes(3));
    order.advanceFulfilment({ status: "delivered" }, days(2));
    expect(order.snapshot().timeline.map((entry) => entry.status)).toEqual(["placed", "paid", "fulfilling", "shipped", "delivered"]);
    const deliveredEvent = order.pullEvents().at(-1);
    expect(deliveredEvent).toMatchObject({ name: "OrderDelivered", payload: { lines: [{ sku: "HOLT-CHA-3", slug: "holt-sofa", productName: "Holt" }, { sku: "KITE-OCH", slug: "kite-lamp", productName: "Kite" }] } });
  });
});

describe("Order refunds", () => {
  it("refund amount must be within paid − refunded − pending (VALIDATION_FAILED otherwise)", () => {
    const order = delivered();
    expect(() => order.requestRefund({ amountCents: 0, reason: "zero" }, days(3))).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => order.requestRefund({ amountCents: -5, reason: "negative" }, days(3))).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    order.requestRefund({ amountCents: 300_000, reason: "pending" }, days(3));
    expect(order.refundableCents()).toBe(13_200);
    expect(() => order.requestRefund({ amountCents: 13_201, reason: "too much" }, days(3))).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(order.requestRefund({ amountCents: 13_200, reason: "rest" }, days(3)).status).toBe("pending");
  });

  it("refund of an unpaid order is an INVALID_TRANSITION", () => {
    expect(() => placed().requestRefund({ amountCents: 100, reason: "x" }, t0)).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
  });

  it("a failed refund stops counting as pending and does not change refundedCents", () => {
    const order = delivered();
    const refund = order.requestRefund({ amountCents: TOTAL, reason: "all" }, days(3));
    expect(order.refundableCents()).toBe(0);
    expect(settle(order, refund.id, TOTAL, "failed")).toBe(true);
    expect(order.refundableCents()).toBe(TOTAL);
    expect(order.snapshot()).toMatchObject({ status: "delivered", refundedCents: 0, refunds: [expect.objectContaining({ status: "failed", failureReason: "card expired" })] });
    expect(order.pullEvents().filter((e) => e.name === "OrderRefunded")).toHaveLength(0);
  });

  it("a partial refund before delivery keeps the fulfilment status", () => {
    const order = paid();
    const refund = order.requestRefund({ amountCents: 1000, reason: "scratch" }, minutes(3));
    settle(order, refund.id, 1000, "succeeded", minutes(4));
    expect(order.snapshot()).toMatchObject({ status: "paid", refundedCents: 1000 });
  });

  it("refund outcomes add refunded and partially_refunded timeline entries", () => {
    const order = delivered();
    const part = order.requestRefund({ amountCents: 13_200, reason: "part" }, days(3));
    settle(order, part.id, 13_200);
    const rest = order.requestRefund({ amountCents: 300_000, reason: "rest" }, days(5));
    settle(order, rest.id, 300_000, "succeeded", days(6));
    const statuses = order.snapshot().timeline.map((entry) => entry.status);
    expect(statuses).toContain("partially_refunded");
    expect(statuses.at(-1)).toBe("refunded");
    expect(statuses.filter((status) => status === "refund").length).toBeGreaterThanOrEqual(4);
  });

  it("refund outcome is idempotent per refundId: one OrderRefunded", () => {
    const order = delivered();
    const refund = order.requestRefund({ amountCents: 5000, reason: "x" }, days(3));
    expect(settle(order, refund.id, 5000)).toBe(true);
    expect(settle(order, refund.id, 5000)).toBe(false);
    expect(settle(order, refund.id, 5000, "failed")).toBe(false);
    expect(order.pullEvents().filter((e) => e.name === "OrderRefunded")).toHaveLength(1);
    expect(order.snapshot().refundedCents).toBe(5000);
  });

  it("an outcome for a refund the provider made on its own is recorded", () => {
    const order = paid();
    expect(settle(order, "provider-refund", TOTAL, "succeeded", minutes(9))).toBe(true);
    expect(order.snapshot()).toMatchObject({ status: "refunded", refunds: [expect.objectContaining({ id: "provider-refund", status: "succeeded" })] });
  });
});

describe("Order returns", () => {
  it("return outside the 30 day window is ORDER_NOT_RETURNABLE", () => {
    const order = delivered();
    expect(() => order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "late" }, days(33))).toThrow(expect.objectContaining({ code: "ORDER_NOT_RETURNABLE" }));
    expect(order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "in time" }, days(31)).status).toBe("requested");
  });

  it("return quantities count open and approved returns but not rejected ones", () => {
    const order = delivered();
    const first = order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 2 }], reason: "both" }, days(3));
    expect(() => order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "again" }, days(3))).toThrow(expect.objectContaining({ code: "ORDER_NOT_RETURNABLE" }));
    order.decideReturn({ returnId: first.id, approve: false, note: "Used" }, days(4));
    expect(order.returnableQty("KITE-OCH")).toBe(2);
    expect(order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "retry" }, days(5)).status).toBe("requested");
  });

  it("return of an item that was not bought is ORDER_NOT_RETURNABLE", () => {
    expect(() => delivered().requestReturn({ lines: [{ sku: "NOPE", qty: 1 }], reason: "x" }, days(3))).toThrow(expect.objectContaining({ code: "ORDER_NOT_RETURNABLE" }));
  });

  it("returns are still possible on a partially refunded order", () => {
    const order = delivered();
    const refund = order.requestRefund({ amountCents: 1000, reason: "scratch" }, days(3));
    settle(order, refund.id, 1000);
    expect(order.status).toBe("partially_refunded");
    expect(order.requestReturn({ lines: [{ sku: "HOLT-CHA-3", qty: 1 }], reason: "too big" }, days(5)).status).toBe("requested");
  });

  it("approving a return pro-rates the discount, opens its refund and restocks the lines", () => {
    const order = delivered();
    const ret = order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "too bright" }, days(3));
    order.pullEvents();
    const decision = order.decideReturn({ returnId: ret.id, approve: true }, days(4));
    expect(decision.refund).toMatchObject({ amountCents: 48_600, returnId: ret.id, status: "pending" });
    expect(decision.restockLines).toEqual([{ sku: "KITE-OCH", qty: 1 }]);
    expect(order.pullEvents()).toEqual([expect.objectContaining({ name: "ReturnApproved", payload: expect.objectContaining({ returnId: ret.id, refundCents: 48_600, restock: true }) })]);
  });

  it("pro-rated refund without a discount is the plain line total", () => {
    const order = Order.restore({ ...delivered().snapshot(), pricing: { ...pricing, discountCents: 0, totalCents: 348_000, taxCents: 55_563 } });
    expect(order.defaultReturnRefundCents([{ sku: "KITE-OCH", qty: 2 }, { sku: "HOLT-CHA-3", qty: 1 }])).toBe(348_000);
  });

  it("approving without restock or with an explicit amount", () => {
    const order = delivered();
    const ret = order.requestReturn({ lines: [{ sku: "HOLT-CHA-3", qty: 1 }], reason: "damaged" }, days(3));
    expect(() => order.decideReturn({ returnId: ret.id, approve: true, refundCents: TOTAL + 1 }, days(4))).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    const decision = order.decideReturn({ returnId: ret.id, approve: true, refundCents: 100_000, restock: false }, days(4));
    expect(decision).toMatchObject({ approved: true, restockLines: [], refund: { amountCents: 100_000 }, return: { refundCents: 100_000, restock: false } });
  });

  it("default return refund is capped at what is still refundable", () => {
    const order = delivered();
    order.requestRefund({ amountCents: 300_000, reason: "goodwill" }, days(3));
    const ret = order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "x" }, days(3));
    expect(order.decideReturn({ returnId: ret.id, approve: true }, days(4)).refund?.amountCents).toBe(13_200);
  });

  it("rejecting a return keeps the note and neither refunds nor restocks", () => {
    const order = delivered();
    const ret = order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "scratched" }, days(3));
    order.pullEvents();
    expect(order.decideReturn({ returnId: ret.id, approve: false, note: " Signs of use " }, days(4))).toMatchObject({ approved: false, refund: null, restockLines: [], return: { status: "rejected", note: "Signs of use" } });
    expect(order.pullEvents()).toEqual([expect.objectContaining({ name: "ReturnRejected", payload: expect.objectContaining({ note: "Signs of use" }) })]);
    expect(order.snapshot().refunds).toHaveLength(0);
  });

  it("deciding an already decided return is an INVALID_TRANSITION (409)", () => {
    const order = delivered();
    const ret = order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "x" }, days(3));
    order.decideReturn({ returnId: ret.id, approve: false }, days(4));
    expect(() => order.decideReturn({ returnId: ret.id, approve: true }, days(5))).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
    expect(() => order.decideReturn({ returnId: "missing", approve: true }, days(5))).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("a return becomes refunded when its refund succeeds, and stays approved when it fails", () => {
    const order = delivered();
    const ok = order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "a" }, days(3));
    const bad = order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "b" }, days(3));
    const okRefund = order.decideReturn({ returnId: ok.id, approve: true }, days(4)).refund!;
    const badRefund = order.decideReturn({ returnId: bad.id, approve: true }, days(4)).refund!;
    settle(order, okRefund.id, okRefund.amountCents);
    settle(order, badRefund.id, badRefund.amountCents, "failed");
    expect(order.findReturn(ok.id)?.status).toBe("refunded");
    expect(order.findReturn(bad.id)?.status).toBe("approved");
    expect(order.status).toBe("partially_refunded");
  });
});
