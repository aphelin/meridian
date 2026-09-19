import { beforeEach, describe, expect, it } from "vitest";
import { type CheckoutFixture, checkoutFixture, orderRequest } from "../../test-support/checkout-fixture";
import { ConfirmOrderPaymentCommand } from "./confirm-order-payment.command";
import { ExpireOrdersCommand } from "./expire-orders.command";
import { PlaceOrderCommand } from "./place-order.command";

let f: CheckoutFixture;

async function placeGuestOrder(coupon: string | null = null) {
  const cart = await f.handlers.replaceCart.execute({ userId: null, cartId: null, lines: [{ sku: "HOLT-CHA-3", variantId: "charcoal", qty: 1 }] } as never);
  return (await f.handlers.placeOrder.execute(new PlaceOrderCommand(orderRequest({ couponCode: coupon }), null, cart.id, "corr"))).order;
}

beforeEach(() => {
  f = checkoutFixture();
});

describe("ExpireOrders sweep", () => {
  it("expiry cancels unpaid orders past the hold and releases their stock and coupon", async () => {
    const order = await placeGuestOrder("WELCOME-50");
    f.outbox.rows.length = 0;
    expect(await f.handlers.expireOrders.execute(new ExpireOrdersCommand())).toEqual({ expired: 0 });
    f.clock.advance(15 * 60_000);
    expect(await f.handlers.expireOrders.execute(new ExpireOrdersCommand())).toEqual({ expired: 1 });
    expect(f.orders.get(order.id)).toMatchObject({ status: "cancelled", cancellationReason: "expired" });
    expect(f.outbox.rows.map((row) => [row.name, row.payload])).toEqual([
      ["OrderCancelled", expect.objectContaining({ orderId: order.id, reason: "expired", refundRequired: false })],
      ["inventory.release-reservation", { orderId: order.id, reason: "expired" }],
      // The order already had a payment intent, so the open provider transaction is cancelled too.
      ["payment.void", { orderId: order.id, transactionId: expect.any(String), reason: "Order cancelled (expired) before payment" }],
    ]);
    expect(f.coupons.redemptions).toHaveLength(0);
  });

  it("expiry on demand with olderThanSeconds 0 never touches paid orders", async () => {
    const paid = await placeGuestOrder();
    const unpaid = await placeGuestOrder();
    await f.handlers.confirmPayment.execute(new ConfirmOrderPaymentCommand("m", { orderId: paid.id, paymentId: `pay_${paid.id}`, transactionId: "t", amountCents: paid.pricing.totalCents }));
    expect(await f.handlers.expireOrders.execute(new ExpireOrdersCommand(0))).toEqual({ expired: 1 });
    expect(f.orders.get(paid.id).status).toBe("paid");
    expect(f.orders.get(unpaid.id).status).toBe("cancelled");
    expect(await f.handlers.expireOrders.execute(new ExpireOrdersCommand(0))).toEqual({ expired: 0 });
  });
});
