import { describe, expect, it } from "vitest";
import { Coupon } from "./coupon";

const spring = () => Coupon.create({ code: "spring-20", type: "percent", value: 20, minBasketCents: 0, maxRedemptions: 100, oncePerCustomer: false, active: true, startsAt: null, expiresAt: null, redemptions: 3 });

describe("Coupon administration", () => {
  it("coupon create rejects a percent value outside 1–100", () => {
    expect(() => Coupon.create({ ...spring().snapshot(), value: 150 })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => Coupon.create({ ...spring().snapshot(), value: 0 })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(spring().code).toBe("SPRING-20");
  });

  it("coupon update changes terms, reports changed fields and keeps code and redemptions", () => {
    const coupon = spring();
    expect(coupon.update({ active: false, value: 20, minBasketCents: 10_000 })).toEqual(["active", "minBasketCents"]);
    expect(coupon.snapshot()).toMatchObject({ code: "SPRING-20", active: false, value: 20, minBasketCents: 10_000, redemptions: 3 });
    expect(coupon.update({ active: false })).toEqual([]);
  });

  it("coupon update validates the resulting terms as a whole", () => {
    const fixed = Coupon.create({ ...spring().snapshot(), code: "FIX-5000", type: "fixed", value: 5000 });
    expect(() => fixed.update({ type: "percent" })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(fixed.snapshot().type).toBe("fixed");
    expect(() => spring().update({ startsAt: new Date("2026-10-01"), expiresAt: new Date("2026-09-01") })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("an inactive coupon no longer satisfies the specification", () => {
    const coupon = spring();
    coupon.update({ active: false });
    expect(coupon.active).toBe(false);
  });
});
