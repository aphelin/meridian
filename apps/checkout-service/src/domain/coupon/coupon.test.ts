import { Money } from "@meridian/kernel";
import { describe, expect, it } from "vitest";
import { Coupon, type CouponProps } from "./coupon";
import { CouponSpecification } from "./coupon-specification";

const now = new Date("2026-09-17T10:00:00Z");
const base: Omit<CouponProps, "redemptions"> = { code: "north-10", type: "percent", value: 10, minBasketCents: 0, maxRedemptions: null, oncePerCustomer: false, active: true, startsAt: null, expiresAt: null };
const coupon = (overrides: Partial<CouponProps> = {}) => Coupon.create({ ...base, ...overrides });
const ctx = (overrides: Partial<Parameters<typeof CouponSpecification.evaluate>[1]> = {}) => ({ subtotal: Money.cents(100_000), now, customerKey: "shopper@example.test", alreadyUsedByCustomer: false, ...overrides });
const codeOf = (c: Coupon | null, context = ctx()) => {
  const verdict = CouponSpecification.evaluate(c, context);
  return verdict.satisfied ? "OK" : verdict.code;
};

describe("CouponSpecification", () => {
  it("coupon codes are normalised to upper case and percent discounts apply to the subtotal", () => {
    const c = coupon();
    expect(c.code).toBe("NORTH-10");
    const verdict = CouponSpecification.evaluate(c, ctx({ subtotal: Money.cents(240_000) }));
    expect(verdict).toMatchObject({ satisfied: true });
    expect(verdict.satisfied && verdict.discount.cents).toBe(24_000);
  });

  it("coupon fixed discounts are capped at the subtotal", () => {
    expect(coupon({ type: "fixed", value: 5000 }).discountFor(Money.cents(3000)).cents).toBe(3000);
  });

  it("coupon missing, inactive or not yet started is COUPON_INVALID", () => {
    expect(codeOf(null)).toBe("COUPON_INVALID");
    expect(codeOf(coupon({ active: false }))).toBe("COUPON_INVALID");
    expect(codeOf(coupon({ startsAt: new Date("2026-10-01") }))).toBe("COUPON_INVALID");
  });

  it("coupon past expiresAt is COUPON_EXPIRED", () => {
    expect(codeOf(coupon({ expiresAt: new Date("2026-09-01") }))).toBe("COUPON_EXPIRED");
  });

  it("coupon under the minimum basket is COUPON_MIN_BASKET with the amount in the message", () => {
    const verdict = CouponSpecification.evaluate(coupon({ type: "fixed", value: 5000, minBasketCents: 50_000 }), ctx({ subtotal: Money.cents(30_000) }));
    expect(verdict).toMatchObject({ satisfied: false, code: "COUPON_MIN_BASKET" });
    expect(verdict.message).toContain("€500.00");
  });

  it("coupon at its global limit is COUPON_EXHAUSTED", () => {
    expect(codeOf(Coupon.restore({ ...coupon().snapshot(), maxRedemptions: 3, redemptions: 3 }))).toBe("COUPON_EXHAUSTED");
  });

  it("once-per-customer coupon already used is COUPON_ALREADY_USED, but only when the customer is known", () => {
    const welcome = coupon({ oncePerCustomer: true });
    expect(codeOf(welcome, ctx({ alreadyUsedByCustomer: true }))).toBe("COUPON_ALREADY_USED");
    expect(codeOf(welcome, ctx({ alreadyUsedByCustomer: true, customerKey: null }))).toBe("OK");
  });

  it("coupon rules are checked in order: invalid, expired, min basket, exhausted, already used", () => {
    const everythingWrong = Coupon.restore({ ...coupon().snapshot(), active: true, expiresAt: new Date("2026-01-01"), minBasketCents: 999_999, maxRedemptions: 1, redemptions: 1, oncePerCustomer: true });
    const context = ctx({ alreadyUsedByCustomer: true });
    expect(codeOf(everythingWrong, context)).toBe("COUPON_EXPIRED");
    expect(codeOf(Coupon.restore({ ...everythingWrong.snapshot(), expiresAt: null }), context)).toBe("COUPON_MIN_BASKET");
    expect(codeOf(Coupon.restore({ ...everythingWrong.snapshot(), expiresAt: null, minBasketCents: 0 }), context)).toBe("COUPON_EXHAUSTED");
    expect(codeOf(Coupon.restore({ ...everythingWrong.snapshot(), expiresAt: null, minBasketCents: 0, maxRedemptions: null }), context)).toBe("COUPON_ALREADY_USED");
  });

  it("coupon redeem throws the specification error code", () => {
    expect(() => coupon({ expiresAt: new Date("2026-01-01") }).redeem("order-1", { ...ctx(), customerKey: "k" })).toThrow(expect.objectContaining({ code: "COUPON_EXPIRED" }));
  });
});

describe("Coupon aggregate", () => {
  it("coupon redemption counts, keys once-per-customer use and raises CouponRedeemed", () => {
    const welcome = coupon({ code: "WELCOME-50", type: "fixed", value: 5000, minBasketCents: 50_000, oncePerCustomer: true });
    const customerKey = Coupon.customerKey(null, " Shopper@Example.TEST ")!;
    expect(customerKey).toBe("shopper@example.test");
    const redemption = welcome.redeem("order-1", { ...ctx(), customerKey });
    expect(redemption).toMatchObject({ couponCode: "WELCOME-50", orderId: "order-1", onceKey: customerKey, discountCents: 5000 });
    expect(welcome.redemptions).toBe(1);
    expect(welcome.pullEvents()).toEqual([expect.objectContaining({ name: "CouponRedeemed", payload: { couponCode: "WELCOME-50", orderId: "order-1", customerKey, discountCents: 5000 } })]);
    expect(Coupon.customerKey("user-1", "x@y.z")).toBe("user-1");
  });

  it("coupon creation validates values", () => {
    expect(() => coupon({ value: 150 })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => coupon({ type: "fixed", value: 0 })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => coupon({ code: "!" })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });
});
