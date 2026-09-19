import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { checkout } from "../support/http";
import { type KafkaTap, kafkaTap } from "../support/kafka";
import { waitForMail } from "../support/mailhog";
import { adminStock, createProduct, paidOrder, paymentSummary, registerUser, transition, waitForOrderStatus } from "../support/shop";
import { waitFor } from "../support/wait";

describe("customer cancellation", () => {
  let tap: KafkaTap;
  beforeAll(async () => {
    tap = await kafkaTap(["meridian.checkout", "meridian.payment", "meridian.inventory"]);
  });
  afterAll(async () => {
    await tap?.stop();
  });

  test("customer cancel of a paid order in fulfilment refunds the full payment and restocks every line", async () => {
    const product = await createProduct({ priceCents: 35_000, variants: 2, onHand: 4 });
    const [a, b] = product.variants;
    const user = await registerUser("cancel", { verify: false });
    const shopper = { token: user.accessToken, email: user.email, name: user.name };
    const { placed } = await paidOrder(shopper, [
      { sku: a.sku, variantId: a.variantId, qty: 2 },
      { sku: b.sku, variantId: b.variantId, qty: 1 },
    ]);
    const orderId = placed.order.id as string;
    const total = placed.order.pricing.totalCents as number;
    await waitFor(async () => (await adminStock(a.sku)).onHand === 2 && (await adminStock(b.sku)).onHand === 3, "stock committed at payment");
    await transition(orderId, { status: "fulfilling" });

    const cancel = await checkout().post(`/orders/${orderId}/cancel`, undefined, { token: user.accessToken });
    expect(cancel.status, cancel.text).toBeLessThan(300);
    expect(cancel.json).toMatchObject({ status: "cancelled", cancellationReason: "customer" });
    const cancelled = await tap.find("OrderCancelled", (e) => e.payload.orderId === orderId, "order cancelled");
    expect(cancelled.envelope!.payload).toMatchObject({ reason: "customer", refundRequired: true, totalCents: total });

    // full refund through payment-service, recorded back on the order
    await tap.find("PaymentRefunded", (e) => e.payload.orderId === orderId && e.payload.amountCents === total, "full refund by payment-service");
    await tap.find("OrderRefunded", (e) => e.payload.orderId === orderId && e.payload.totalRefundedCents === total, "refund recorded by checkout");
    const view = await waitForOrderStatus(orderId, (o) => o.refundedCents === total && o.refunds.some((r: { status: string }) => r.status === "succeeded"));
    expect(view.actions.cancel).toBe(false);
    await waitFor(async () => (await paymentSummary(orderId)).status === "refunded", "payment refunded");

    // committed stock comes back through inventory.restock (never a reservation release)
    await waitFor(async () => (await adminStock(a.sku)).onHand === 4 && (await adminStock(b.sku)).onHand === 4, "every line restocked");
    expect(tap.count((r) => r.envelope?.name === "StockReservationReleased" && r.envelope.payload.orderId === orderId)).toBe(0);
    await waitForMail(user.email, (m) => m.subject.includes(`Order ${placed.order.number} was cancelled`), "cancellation email");

    const twice = await checkout().post(`/orders/${orderId}/cancel`, undefined, { token: user.accessToken });
    expect(twice.status).toBe(409);
    expect(twice.json.code).toBe("ORDER_NOT_CANCELLABLE");
  });
});
