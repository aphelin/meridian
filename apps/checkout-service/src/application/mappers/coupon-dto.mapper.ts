import type { CouponDto } from "@meridian/contracts";
import type { Coupon } from "../../domain";

export function toCouponDto(coupon: Coupon): CouponDto {
  const c = coupon.snapshot();
  return {
    code: c.code,
    type: c.type,
    value: c.value,
    minBasketCents: c.minBasketCents,
    maxRedemptions: c.maxRedemptions,
    redemptions: c.redemptions,
    oncePerCustomer: c.oncePerCustomer,
    active: c.active,
    startsAt: c.startsAt ? c.startsAt.toISOString() : null,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
  };
}
