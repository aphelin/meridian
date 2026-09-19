import { beforeEach, describe, expect, it } from "vitest";
import { type CheckoutFixture, checkoutFixture, orderRequest } from "../../test-support/checkout-fixture";
import { PlaceOrderCommand } from "../commands/place-order.command";

let f: CheckoutFixture;

async function guestCart(lines = [{ sku: "HOLT-CHA-3", variantId: "charcoal", qty: 1 }, { sku: "KITE-OCH", variantId: "ochre", qty: 1 }]) {
  return (await f.handlers.replaceCart.execute({ userId: null, cartId: null, lines } as never)).id;
}
const place = (cartId: string | null, overrides = {}, userId: string | null = null) =>
  f.handlers.placeOrder.execute(new PlaceOrderCommand(orderRequest(overrides), userId, cartId, "corr-probe"));

beforeEach(() => {
  f = checkoutFixture();
});

describe("PlaceOrderSaga", () => {
  it("saga places the order, redeems the coupon, reserves stock, creates the intent and clears the cart", async () => {
    const cartId = await guestCart();
    const result = await place(cartId, { couponCode: "north-10" });

    expect(result.order).toMatchObject({ status: "placed", couponCode: "NORTH-10", correlationId: "corr-probe", customer: { userId: null, email: "guest@example.test" } });
    expect(result.order.number).toMatch(/^M-[A-Z2-7]{8}$/);
    expect(result.order.pricing).toMatchObject({ subtotalCents: 294_000, discountCents: 29_400, shippingCents: 0, totalCents: 264_600, taxRatePercent: 19 });
    expect(result.accessToken).toBe(f.tokens.issue(result.order.id));
    expect(result.payment.clientSecret).toBe("secret");
    expect(f.outbox.rows.map((row) => row.name)).toEqual(["OrderPlaced", "CouponRedeemed"]);
    expect(f.inventory.reserved).toEqual([{ orderId: result.order.id, lines: [{ sku: "HOLT-CHA-3", qty: 1 }, { sku: "KITE-OCH", qty: 1 }] }]);
    expect(f.payments.requests[0]).toMatchObject({ orderId: result.order.id, amountCents: 264_600, currency: "EUR", customer: { email: "guest@example.test" } });
    expect(f.orders.get(result.order.id).payment).toEqual({ paymentId: `pay_${result.order.id}`, transactionId: `txn_${result.order.id}` });
    expect((await f.carts.findById(cartId))!.isEmpty).toBe(true);
    expect(f.coupons.redemptions).toHaveLength(1);
  });

  it("saga gives signed-in shoppers no access token and uses their cart", async () => {
    await f.handlers.replaceCart.execute({ userId: "user-1", cartId: null, lines: [{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }] } as never);
    const result = await place(null, {}, "user-1");
    expect(result.accessToken).toBeNull();
    expect(result.order.customer.userId).toBe("user-1");
    expect(result.order.pricing.shippingCents).toBe(4900);
  });

  it("saga compensates an out-of-stock reservation by cancelling the order and releasing the coupon", async () => {
    f.inventory.outOfStock.add("OOS-1");
    const cartId = await guestCart([{ sku: "OOS-1", variantId: "only", qty: 1 }]);
    await expect(place(cartId, { couponCode: "NORTH-10" })).rejects.toMatchObject({ code: "OUT_OF_STOCK" });

    const cancelled = f.outbox.named("OrderCancelled");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].payload).toMatchObject({ reason: "out-of-stock", refundRequired: false });
    expect(f.outbox.named("inventory.release-reservation")).toHaveLength(0);
    expect(f.payments.requests).toHaveLength(0);
    expect(f.coupons.redemptions).toHaveLength(0);
    expect((await f.carts.findById(cartId))!.lines).toHaveLength(1);
  });

  it("saga refuses a product flagged sold out after it was carted, before placing or reserving anything (amendment 1p)", async () => {
    const cartId = await guestCart();
    f.catalog.soldOut.add("KITE-OCH");
    await expect(place(cartId, { couponCode: "NORTH-10" })).rejects.toMatchObject({ code: "OUT_OF_STOCK", details: { sku: "KITE-OCH" } });
    expect(f.inventory.reserved).toHaveLength(0);
    expect(f.outbox.rows).toHaveLength(0);
    expect(f.payments.requests).toHaveLength(0);
    expect(f.coupons.redemptions).toHaveLength(0);
    expect((await f.carts.findById(cartId))!.lines).toHaveLength(2);
  });

  it("saga compensates an unreachable inventory by cancelling and releasing any hold", async () => {
    f.inventory.reserveError = Object.assign(new Error("timeout"), { code: "UPSTREAM_UNAVAILABLE" });
    const cartId = await guestCart();
    await expect(place(cartId)).rejects.toThrow("timeout");
    expect(f.outbox.named("inventory.release-reservation")[0].payload).toMatchObject({ reason: "cancelled" });
  });

  it("saga compensates a failed payment intent: order cancelled, reservation released, cart kept", async () => {
    f.payments.down = true;
    const cartId = await guestCart([{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }]);
    await expect(place(cartId)).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    const cancelled = f.outbox.named("OrderCancelled")[0].payload as { orderId: string; reason: string };
    expect(cancelled.reason).toBe("payment-unavailable");
    expect(f.outbox.named("inventory.release-reservation")[0].payload).toEqual({ orderId: cancelled.orderId, reason: "payment-failed" });
    expect(f.orders.get(cancelled.orderId).status).toBe("cancelled");
    expect((await f.carts.findById(cartId))!.lines).toHaveLength(1);
  });

  it("saga enforces once-per-customer coupons by lower-cased email before placing anything", async () => {
    await place(await guestCart([{ sku: "HOLT-CHA-3", variantId: "charcoal", qty: 1 }]), { couponCode: "WELCOME-50", customer: { email: "w@example.test", name: "W" } });
    const second = await guestCart([{ sku: "HOLT-CHA-3", variantId: "charcoal", qty: 1 }]);
    await expect(place(second, { couponCode: "WELCOME-50", customer: { email: "W@EXAMPLE.TEST", name: "W" } })).rejects.toMatchObject({ code: "COUPON_ALREADY_USED" });
    expect(f.orders.rows.size).toBe(1);
  });

  it("saga rejects an empty bag and a coupon below its minimum basket", async () => {
    await expect(place(null)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const cartId = await guestCart([{ sku: "OOS-1", variantId: "only", qty: 1 }]);
    await expect(place(cartId, { couponCode: "WELCOME-50" })).rejects.toMatchObject({ code: "COUPON_MIN_BASKET" });
    expect(f.orders.rows.size).toBe(0);
  });
});
