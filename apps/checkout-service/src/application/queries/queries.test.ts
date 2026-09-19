import { beforeEach, describe, expect, it } from "vitest";
import { type CheckoutFixture, checkoutFixture, orderRequest } from "../../test-support/checkout-fixture";
import { AnonymiseCustomerCommand } from "../commands/anonymise-customer.command";
import { PlaceOrderCommand } from "../commands/place-order.command";
import { ReplaceCartItemsCommand } from "../commands/replace-cart-items.command";
import { SeedCouponsCommand } from "../commands/seed-coupons.command";
import { GetOrderQuery } from "./get-order.query";
import { ListMyOrdersQuery } from "./list-my-orders.query";
import { QuoteCheckoutQuery } from "./quote-checkout.query";

let f: CheckoutFixture;
beforeEach(() => {
  f = checkoutFixture();
});

const holt = [{ sku: "HOLT-CHA-3", variantId: "charcoal", qty: 1 }];

async function placeFor(userId: string | null) {
  const cart = await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(userId, null, holt));
  return f.handlers.placeOrder.execute(new PlaceOrderCommand(orderRequest(), userId, userId ? null : cart.id, "corr"));
}

describe("QuoteCheckout", () => {
  it("quote with a valid coupon applies it and lists four shipping options", async () => {
    const quote = await f.handlers.quote.execute(new QuoteCheckoutQuery({ lines: holt, shippingMethod: "standard", country: "DE", couponCode: "north-10" }, null, null));
    expect(quote.coupon).toEqual({ code: "NORTH-10", applied: true, message: expect.any(String), discountCents: 24_000 });
    expect(quote.pricing).toMatchObject({ totalCents: 216_000, taxRatePercent: 19 });
    expect(quote.shippingOptions.map((o) => [o.id, o.priceCents])).toEqual([["standard", 0], ["express", 9900], ["white-glove", 14_900], ["collect", 0]]);
  });

  it("quote never fails for coupon problems and reports the message instead", async () => {
    const bogus = await f.handlers.quote.execute(new QuoteCheckoutQuery({ lines: holt, shippingMethod: "white-glove", country: "US", couponCode: "BOGUS" }, null, null));
    expect(bogus.coupon).toMatchObject({ code: "BOGUS", applied: false, discountCents: 0 });
    expect(bogus.pricing).toMatchObject({ shippingCents: 14_900, taxCents: 0, discountCents: 0 });
    const small = await f.handlers.quote.execute(new QuoteCheckoutQuery({ lines: [{ sku: "OOS-1", variantId: "only", qty: 1 }], shippingMethod: "express", country: "GE", couponCode: "WELCOME-50" }, null, null));
    expect(small.coupon?.message).toMatch(/500/);
    expect(small.pricing).toMatchObject({ shippingCents: 9900, taxRatePercent: 18 });
  });

  it("quote checks once-per-customer coupons only for signed-in users, never by a guest email", async () => {
    await f.handlers.placeOrder.execute(
      new PlaceOrderCommand(orderRequest({ couponCode: "WELCOME-50", customer: { email: "used@example.test", name: "U" } }), null, (await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, null, holt))).id, "corr"),
    );
    await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand("user-7", null, holt));
    await f.handlers.placeOrder.execute(new PlaceOrderCommand(orderRequest({ couponCode: "WELCOME-50" }), "user-7", null, "corr"));
    expect(f.coupons.redemptions.map((r) => r.customerKey)).toEqual(["used@example.test", "user-7"]);

    const guestQuote = await f.handlers.quote.execute(new QuoteCheckoutQuery({ lines: holt, shippingMethod: "standard", country: "DE", couponCode: "WELCOME-50", email: "USED@example.test" }, null, null));
    expect(guestQuote.coupon).toMatchObject({ code: "WELCOME-50", applied: true, discountCents: 5000 });

    const userQuote = await f.handlers.quote.execute(new QuoteCheckoutQuery({ lines: holt, shippingMethod: "standard", country: "DE", couponCode: "WELCOME-50" }, "user-7", null));
    expect(userQuote.coupon).toMatchObject({ code: "WELCOME-50", applied: false, discountCents: 0 });
    expect(userQuote.coupon?.message).toMatch(/already used/);
  });

  it("quote without lines prices the caller's server cart", async () => {
    await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand("user-1", null, holt));
    const quote = await f.handlers.quote.execute(new QuoteCheckoutQuery({ shippingMethod: "collect", country: "NL" }, "user-1", null));
    expect(quote).toMatchObject({ coupon: null, pricing: { subtotalCents: 240_000, taxRatePercent: 21 } });
  });
});

describe("GetOrder access", () => {
  it("guest order access token grants read access; missing or wrong tokens are forbidden", async () => {
    const { order, accessToken } = await placeFor(null);
    await expect(f.handlers.getOrder.execute(new GetOrderQuery(order.id, null, null))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.handlers.getOrder.execute(new GetOrderQuery(order.id, null, "wrong"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const viewed = await f.handlers.getOrder.execute(new GetOrderQuery(order.id, null, accessToken));
    expect(viewed.actions.pay).toBe(true);
  });

  it("owners and admins read orders, other users are forbidden, unknown orders are 404", async () => {
    const { order } = await placeFor("user-1");
    await expect(f.handlers.getOrder.execute(new GetOrderQuery(order.id, { userId: "user-1", role: "customer" }, null))).resolves.toMatchObject({ id: order.id });
    await expect(f.handlers.getOrder.execute(new GetOrderQuery(order.id, { userId: "admin", role: "admin" }, null))).resolves.toMatchObject({ id: order.id });
    await expect(f.handlers.getOrder.execute(new GetOrderQuery(order.id, { userId: "user-2", role: "customer" }, null))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.handlers.getOrder.execute(new GetOrderQuery("nope", { userId: "admin", role: "admin" }, null))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await f.handlers.listMine.execute(new ListMyOrdersQuery("user-1"))).map((o) => o.id)).toEqual([order.id]);
  });
});

describe("UserDeleted anonymisation and seeding", () => {
  it("anonymises the deleted user's orders and deletes their cart once per message", async () => {
    const { order } = await placeFor("user-1");
    await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand("user-1", null, holt));
    expect(await f.handlers.anonymise.execute(new AnonymiseCustomerCommand("msg-1", "user-1"))).toEqual({ orders: 1 });
    expect(f.orders.get(order.id).customer).toEqual({ userId: "user-1", name: "Deleted customer", email: "deleted-user-1@anonymised.invalid" });
    expect(f.orders.get(order.id).shippingAddress.phone).toBeNull();
    expect(await f.carts.findByUserId("user-1")).toBeNull();
    expect(await f.handlers.anonymise.execute(new AnonymiseCustomerCommand("msg-1", "user-1"))).toEqual({ orders: 0 });
  });

  it("coupon seeding is idempotent", async () => {
    const fresh = checkoutFixture();
    fresh.coupons.coupons.clear();
    expect(await fresh.handlers.seedCoupons.execute(new SeedCouponsCommand())).toEqual({ created: ["NORTH-10", "WELCOME-50"], existing: [] });
    expect(await fresh.handlers.seedCoupons.execute(new SeedCouponsCommand())).toEqual({ created: [], existing: ["NORTH-10", "WELCOME-50"] });
  });
});
