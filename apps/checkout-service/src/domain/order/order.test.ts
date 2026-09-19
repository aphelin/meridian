import type { OrderLineSnapshot, PricingBreakdown } from "@meridian/contracts";
import { describe, expect, it } from "vitest";
import { ANONYMISED_NAME, Order } from "./order";
import { OrderNumber } from "./order-number";
import { canTransition } from "./order-status";

const t0 = new Date("2026-09-17T10:00:00Z");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);
const days = (n: number) => new Date(t0.getTime() + n * 86_400_000);
const lines: OrderLineSnapshot[] = [
  { sku: "HOLT-CHA-3", slug: "holt-sofa", productName: "Holt", variantLabel: "Charcoal wool", qty: 1, unitPriceCents: 240_000, lineTotalCents: 240_000 },
  { sku: "KITE-OCH", slug: "kite-lamp", productName: "Kite", variantLabel: "Ochre linen", qty: 2, unitPriceCents: 54_000, lineTotalCents: 108_000 },
];
const pricing: PricingBreakdown = { subtotalCents: 348_000, discountCents: 34_800, shippingCents: 0, taxCents: 50_007, taxRatePercent: 19, totalCents: 313_200, currency: "EUR" };

function placed(userId: string | null = null) {
  return Order.place({
    id: "order-1",
    number: "M-ABCDEFGH",
    customer: { userId, email: "guest@example.test", name: "Guest Buyer" },
    shippingAddress: { fullName: "Guest Buyer", line1: "1 Road", line2: null, city: "Berlin", postalCode: "10115", country: "DE", phone: "+49 1" },
    shippingMethod: "standard",
    lines,
    pricing,
    couponCode: "NORTH-10",
    correlationId: "corr-1",
    holdMinutes: 15,
    now: t0,
  });
}
const paid = () => {
  const order = placed();
  order.markPaid({ paymentId: "pay-1", transactionId: "txn-1", amountCents: 313_200 }, minutes(1));
  order.pullEvents();
  return order;
};
const delivered = () => {
  const order = paid();
  order.startFulfilment(minutes(2));
  order.ship({ carrier: "DHL", trackingNumber: "123" }, minutes(3));
  order.deliver(days(2));
  order.pullEvents();
  return order;
};

describe("OrderNumber", () => {
  it("order number is M- plus 8 RFC 4648 base32 characters", () => {
    expect(OrderNumber.fromBytes(new Uint8Array([0, 0, 0, 0, 0])).value).toBe("M-AAAAAAAA");
    expect(OrderNumber.fromBytes(new Uint8Array([255, 255, 255, 255, 255])).value).toBe("M-77777777");
    for (let i = 0; i < 50; i++) expect(OrderNumber.generate().value).toMatch(/^M-[A-Z2-7]{8}$/);
  });
});

describe("Order placement", () => {
  it("places an order with a payment deadline, timeline and OrderPlaced event", () => {
    const order = placed();
    const o = order.snapshot();
    expect(o.status).toBe("placed");
    expect(o.paymentDeadline).toEqual(minutes(15));
    expect(o.timeline.map((e) => e.status)).toEqual(["placed"]);
    const [event] = order.pullEvents();
    expect(event).toMatchObject({ name: "OrderPlaced", aggregateType: "Order", aggregateId: "order-1" });
    expect(event.payload).toMatchObject({ orderId: "order-1", number: "M-ABCDEFGH", couponCode: "NORTH-10", pricing, placedAt: t0.toISOString() });
  });

  it("rejects inconsistent pricing or empty orders", () => {
    expect(() => Order.place({ ...placed().snapshot(), holdMinutes: 15, now: t0, lines: [] })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => Order.place({ ...placed().snapshot(), holdMinutes: 15, now: t0, pricing: { ...pricing, totalCents: 1 } })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });
});

describe("Order state machine", () => {
  it("state machine allows placed → paid → fulfilling → shipped → delivered with events", () => {
    const order = placed();
    order.pullEvents();
    order.markPaid({ paymentId: "pay-1", transactionId: "txn-1", amountCents: 313_200 }, minutes(1));
    order.startFulfilment(minutes(2));
    order.ship({ carrier: "DHL", trackingNumber: "JD0001" }, minutes(3));
    order.deliver(days(3));
    expect(order.status).toBe("delivered");
    expect(order.pullEvents().map((e) => e.name)).toEqual(["OrderPaid", "OrderFulfilling", "OrderShipped", "OrderDelivered"]);
    const o = order.snapshot();
    expect(o.fulfillment.trackingUrl).toContain("JD0001");
    expect(o.paymentDeadline).toBeNull();
  });

  it("invalid transition is rejected with INVALID_TRANSITION", () => {
    expect(() => placed().startFulfilment(t0)).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
    expect(() => paid().ship({ carrier: "DHL", trackingNumber: "1" }, t0)).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
    expect(() => paid().deliver(t0)).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
    expect(canTransition("cancelled", "paid")).toBe(false);
    expect(canTransition("refunded", "partially_refunded")).toBe(false);
  });

  it("shipping transition requires carrier and tracking number", () => {
    const order = paid();
    order.startFulfilment(t0);
    expect(() => order.ship({ carrier: " ", trackingNumber: "1" }, t0)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("payment confirmation for a non-placed order or a wrong amount is ORDER_NOT_PAYABLE", () => {
    expect(() => placed().markPaid({ paymentId: "p", transactionId: "t", amountCents: 1 }, t0)).toThrow(expect.objectContaining({ code: "ORDER_NOT_PAYABLE" }));
    expect(() => paid().markPaid({ paymentId: "p", transactionId: "t", amountCents: 313_200 }, t0)).toThrow(expect.objectContaining({ code: "ORDER_NOT_PAYABLE" }));
  });

  it("cancelling an unpaid order needs no refund; a paid one requires refunding the paid amount", () => {
    const unpaid = placed();
    expect(unpaid.cancel("expired", minutes(16))).toEqual({ refundRequired: false, refundableCents: 0, wasPaid: false, refund: null, restockLines: [] });
    expect(unpaid.pullEvents().at(-1)).toMatchObject({ name: "OrderCancelled", payload: { reason: "expired", refundRequired: false, totalCents: 313_200 } });
    const order = paid();
    expect(order.cancel("customer", minutes(5))).toMatchObject({ refundRequired: true, refundableCents: 313_200, wasPaid: true, refund: { amountCents: 313_200, status: "pending", returnId: null } });
    expect(order.snapshot().cancellationReason).toBe("customer");
  });

  it("shipped orders cannot be cancelled (ORDER_NOT_CANCELLABLE)", () => {
    const order = paid();
    order.startFulfilment(t0);
    order.ship({ carrier: "UPS", trackingNumber: "1Z" }, t0);
    expect(() => order.cancel("customer", t0)).toThrow(expect.objectContaining({ code: "ORDER_NOT_CANCELLABLE" }));
  });

  it("expiry applies to unpaid orders past their payment deadline only", () => {
    expect(placed().isExpiredAt(minutes(14))).toBe(false);
    expect(placed().isExpiredAt(minutes(15))).toBe(true);
    expect(paid().isExpiredAt(days(1))).toBe(false);
  });
});

describe("Order refunds, returns and invoices", () => {
  it("partial then full refund after delivery transitions to partially_refunded then refunded", () => {
    const order = delivered();
    const refund = order.requestRefund({ amountCents: 100_000, reason: "damaged" }, days(3));
    expect(() => order.requestRefund({ amountCents: 213_201, reason: "too much" }, days(3))).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(order.recordRefundOutcome({ refundId: refund.id, amountCents: 100_000, status: "succeeded", reason: null }, days(4))).toBe(true);
    expect(order.recordRefundOutcome({ refundId: refund.id, amountCents: 100_000, status: "succeeded", reason: null }, days(4))).toBe(false);
    expect(order.status).toBe("partially_refunded");
    const rest = order.requestRefund({ amountCents: 213_200, reason: "goodwill" }, days(5));
    order.recordRefundOutcome({ refundId: rest.id, amountCents: 213_200, status: "succeeded", reason: null }, days(5));
    expect(order.status).toBe("refunded");
    expect(order.pullEvents().filter((e) => e.name === "OrderRefunded").map((e) => (e.payload as { full: boolean }).full)).toEqual([false, true]);
  });

  it("a failed refund is recorded without changing refunded amount", () => {
    const order = paid();
    const refund = order.requestRefund({ amountCents: 1000, reason: "x" }, t0);
    order.recordRefundOutcome({ refundId: refund.id, amountCents: 1000, status: "failed", reason: "card closed" }, t0);
    expect(order.snapshot()).toMatchObject({ refundedCents: 0, status: "paid", refunds: [expect.objectContaining({ status: "failed", failureReason: "card closed" })] });
  });

  it("returns are possible within 30 days of delivery for unreturned quantities", () => {
    const order = delivered();
    const ret = order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "colour" }, days(5));
    expect(() => order.requestReturn({ lines: [{ sku: "KITE-OCH", qty: 2 }], reason: "again" }, days(5))).toThrow(expect.objectContaining({ code: "ORDER_NOT_RETURNABLE" }));
    expect(order.defaultReturnRefundCents(ret.lines)).toBe(54_000 - Math.round((54_000 * 34_800) / 348_000));
    expect(order.decideReturn({ returnId: ret.id, approve: true }, days(6))).toMatchObject({ approved: true, return: { refundCents: 48_600, restock: true }, refund: { amountCents: 48_600, returnId: ret.id } });
    expect(delivered().canRequestReturn(days(40))).toBe(false);
    expect(() => paid().requestReturn({ lines: [{ sku: "KITE-OCH", qty: 1 }], reason: "x" }, t0)).toThrow(expect.objectContaining({ code: "ORDER_NOT_RETURNABLE" }));
  });

  it("issues one invoice for a paid order", () => {
    const order = paid();
    expect(() => placed().issueInvoice("INV-2026-000001", t0)).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
    expect(order.issueInvoice("INV-2026-000001", t0)).toBe(true);
    expect(order.issueInvoice("INV-2026-000002", t0)).toBe(false);
    expect(order.actionsAt(t0).downloadInvoice).toBe(true);
  });
});

describe("Order privacy and viewer actions", () => {
  it("anonymises the customer of a deleted account", () => {
    const order = placed("user-9");
    expect(order.anonymiseCustomer()).toBe(true);
    expect(order.snapshot()).toMatchObject({ customer: { userId: "user-9", name: ANONYMISED_NAME, email: "deleted-user-9@anonymised.invalid" }, shippingAddress: { phone: null, city: "Berlin" } });
    expect(order.anonymiseCustomer()).toBe(false);
    expect(placed(null).anonymiseCustomer()).toBe(false);
  });

  it("offers pay only before the payment deadline", () => {
    expect(placed().actionsAt(minutes(1))).toEqual({ cancel: true, requestReturn: false, downloadInvoice: false, pay: true });
    expect(placed().actionsAt(minutes(20)).pay).toBe(false);
    expect(delivered().actionsAt(days(3))).toMatchObject({ cancel: false, requestReturn: true, pay: false });
  });
});
