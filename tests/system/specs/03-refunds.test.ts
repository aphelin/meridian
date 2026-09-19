import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tokens } from "../support/auth";
import { checkout } from "../support/http";
import { type KafkaTap, kafkaTap } from "../support/kafka";
import { waitForMail } from "../support/mailhog";
import { createProduct, deliver, paidOrder, paymentSummary, registerUser, waitForOrderStatus } from "../support/shop";
import { waitFor } from "../support/wait";

describe("refunds", () => {
  let tap: KafkaTap;
  beforeAll(async () => {
    tap = await kafkaTap(["meridian.checkout", "meridian.payment"]);
  });
  afterAll(async () => {
    await tap?.stop();
  });

  test("admin partial refund then full refund settle through payment-service (PaymentRefunded → checkout.record-refund → OrderRefunded)", async () => {
    const product = await createProduct({ priceCents: 70_000, onHand: 3 });
    const user = await registerUser("refund", { verify: false });
    const shopper = { token: user.accessToken, email: user.email, name: user.name };
    const [v] = product.variants;
    const { placed } = await paidOrder(shopper, [{ sku: v.sku, variantId: v.variantId, qty: 1 }]);
    const orderId = placed.order.id as string;
    const total = placed.order.pricing.totalCents as number; // 70 000 + 4 900 standard shipping
    expect(total).toBe(74_900);
    const admin = tokens.admin();
    // a goodwill refund after delivery (before delivery checkout keeps the fulfilment status and only records refundedCents)
    await deliver(orderId);
    await waitForOrderStatus(orderId, "delivered");

    // refund validation: more than paid − refunded is rejected before any command is sent
    const tooMuch = await checkout().post(`/admin/orders/${orderId}/refunds`, { amountCents: total + 1, reason: "too much" }, { token: admin });
    expect(tooMuch.status, tooMuch.text).toBe(400);
    expect((await checkout().post(`/admin/orders/${orderId}/refunds`, { amountCents: 100, reason: "customer" }, { token: user.accessToken })).status).toBe(403);

    // partial refund
    const partial = await checkout().post(`/admin/orders/${orderId}/refunds`, { amountCents: 20_000, reason: "scratch on the leg" }, { token: admin });
    expect(partial.status, partial.text).toBe(202);
    const refunded1 = await tap.find("PaymentRefunded", (e) => e.payload.orderId === orderId && e.payload.amountCents === 20_000, "payment-service refunds 20 000");
    const orderRefunded1 = await tap.find("OrderRefunded", (e) => e.payload.orderId === orderId && e.payload.refundId === refunded1.envelope!.payload.refundId, "checkout records the partial refund");
    expect(orderRefunded1.envelope!.payload).toMatchObject({ amountCents: 20_000, totalRefundedCents: 20_000, full: false });
    const afterPartial = await waitForOrderStatus(orderId, "partially_refunded");
    expect(afterPartial.refundedCents).toBe(20_000);
    expect(afterPartial.refunds).toEqual(expect.arrayContaining([expect.objectContaining({ amountCents: 20_000, status: "succeeded" })]));
    expect(await paymentSummary(orderId)).toMatchObject({ status: "partially_refunded", refundedCents: 20_000, amountCents: total });
    await waitForMail(user.email, (m) => m.subject.includes(`Refund issued for order ${placed.order.number}`), "partial refund email");

    // remaining amount only
    const over = await checkout().post(`/admin/orders/${orderId}/refunds`, { amountCents: total - 20_000 + 1, reason: "over" }, { token: admin });
    expect(over.status, over.text).toBe(400);
    const rest = await checkout().post(`/admin/orders/${orderId}/refunds`, { amountCents: total - 20_000, reason: "customer returned everything" }, { token: admin });
    expect(rest.status, rest.text).toBe(202);
    const orderRefunded2 = await tap.find("OrderRefunded", (e) => e.payload.orderId === orderId && e.payload.full === true, "checkout records the full refund");
    expect(orderRefunded2.envelope!.payload).toMatchObject({ amountCents: total - 20_000, totalRefundedCents: total });
    const afterFull = await waitForOrderStatus(orderId, "refunded");
    expect(afterFull.refundedCents).toBe(total);
    expect(afterFull.refunds.filter((r: { status: string }) => r.status === "succeeded")).toHaveLength(2);
    await waitFor(async () => (await paymentSummary(orderId)).status === "refunded", "payment summary refunded");
    expect(await paymentSummary(orderId)).toMatchObject({ refundedCents: total });

    // nothing left to refund; each refund recorded exactly once
    const nothing = await checkout().post(`/admin/orders/${orderId}/refunds`, { amountCents: 1, reason: "again" }, { token: admin });
    expect(nothing.status).toBeGreaterThanOrEqual(400);
    expect(tap.count((r) => r.envelope?.name === "OrderRefunded" && r.envelope.payload.orderId === orderId)).toBe(2);
    expect(tap.count((r) => r.envelope?.name === "PaymentRefunded" && r.envelope.payload.orderId === orderId)).toBe(2);
    const detail = await checkout().get(`/admin/orders/${orderId}`, { token: admin });
    expect(detail.json.payment).toMatchObject({ status: "refunded", refundedCents: total });
    expect(detail.json.audit.filter((a: { actorId: string }) => a.actorId === "system-tests-admin").length).toBeGreaterThanOrEqual(2);
  });
});
