import type { CouponInput } from "@meridian/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { type CheckoutFixture, checkoutFixture } from "../../test-support/checkout-fixture";
import { placeOrder } from "../../test-support/order-journeys";
import { ListCouponsQuery } from "../queries/list-coupons.query";
import { QuoteCheckoutQuery } from "../queries/quote-checkout.query";
import { CreateCouponCommand } from "./create-coupon.command";
import { UpdateCouponCommand } from "./update-coupon.command";

let f: CheckoutFixture;
beforeEach(() => {
  f = checkoutFixture();
});

const spring: CouponInput = { code: "spring-20", type: "percent", value: 20, minBasketCents: 0, maxRedemptions: 100, oncePerCustomer: false, active: true, startsAt: null, expiresAt: "2026-12-31T23:59:59.000Z" };
const quote = (code: string) => f.handlers.quote.execute(new QuoteCheckoutQuery({ lines: [{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }], shippingMethod: "standard", country: "DE", couponCode: code }, null, null));

describe("Admin coupons", () => {
  it("coupon create stores the normalised code with zero redemptions and audits it", async () => {
    const created = await f.handlers.createCoupon.execute(new CreateCouponCommand("admin-1", spring));
    expect(created).toMatchObject({ code: "SPRING-20", redemptions: 0, expiresAt: "2026-12-31T23:59:59.000Z" });
    expect(f.audit.entries).toEqual([expect.objectContaining({ action: "coupon.create", actorId: "admin-1", subjectType: "coupon", subjectId: "SPRING-20", orderId: null })]);
    expect((await quote("spring-20")).coupon).toMatchObject({ applied: true, discountCents: 10_800 });
  });

  it("duplicate coupon code is a CONFLICT and percent above 100 is VALIDATION_FAILED", async () => {
    await expect(f.handlers.createCoupon.execute(new CreateCouponCommand("admin-1", { ...spring, code: "NORTH-10" }))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(f.handlers.createCoupon.execute(new CreateCouponCommand("admin-1", { ...spring, code: "BAD-PCT", value: 150 }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(f.audit.entries).toHaveLength(0);
  });

  it("coupon update deactivates it, keeps its value and audits only changed fields", async () => {
    await f.handlers.createCoupon.execute(new CreateCouponCommand("admin-1", spring));
    const updated = await f.handlers.updateCoupon.execute(new UpdateCouponCommand("admin-2", "spring-20", { active: false, value: 20 }));
    expect(updated).toMatchObject({ code: "SPRING-20", active: false, value: 20 });
    expect(f.audit.entries.at(-1)).toMatchObject({ action: "coupon.update", actorId: "admin-2", meta: { changed: { active: false } } });
    expect((await quote("SPRING-20")).coupon?.applied).toBe(false);
  });

  it("coupon update of an unknown code is NOT_FOUND; a no-op update writes no audit row", async () => {
    await expect(f.handlers.updateCoupon.execute(new UpdateCouponCommand("admin-1", "NOPE", { active: false }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await f.handlers.updateCoupon.execute(new UpdateCouponCommand("admin-1", "NORTH-10", { active: true }));
    expect(f.audit.entries).toHaveLength(0);
  });

  it("coupon list shows live redemption counts", async () => {
    await placeOrder(f, { lines: [{ sku: "HOLT-CHA-3", variantId: "charcoal", qty: 1 }], couponCode: "NORTH-10" });
    const coupons = await f.handlers.listCoupons.execute(new ListCouponsQuery());
    expect(coupons.find((c) => c.code === "NORTH-10")?.redemptions).toBe(1);
    expect(coupons.find((c) => c.code === "WELCOME-50")?.redemptions).toBe(0);
  });
});
