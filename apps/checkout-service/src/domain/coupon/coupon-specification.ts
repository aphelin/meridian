import type { ErrorCode } from "@meridian/contracts";
import { DomainError, Money } from "@meridian/kernel";
import { formatEuros } from "../shared/money-format";
import type { Coupon } from "./coupon";

export type CouponErrorCode = Extract<ErrorCode, "COUPON_INVALID" | "COUPON_EXPIRED" | "COUPON_MIN_BASKET" | "COUPON_EXHAUSTED" | "COUPON_ALREADY_USED">;

export interface CouponContext {
  subtotal: Money;
  now: Date;
  /** Null when the customer is not known yet (anonymous quote); the once-per-customer rule is then not evaluated. */
  customerKey: string | null;
  /** Whether that customer already holds a redemption of this coupon. */
  alreadyUsedByCustomer: boolean;
}

export type CouponVerdict = { satisfied: true; discount: Money; message: string } | { satisfied: false; code: CouponErrorCode; message: string };

/**
 * Specification deciding whether a coupon applies to a basket. Rules are checked in a fixed order so shoppers always
 * see the most fundamental problem first: invalid → expired → minimum basket → exhausted → already used.
 */
export class CouponSpecification {
  static evaluate(coupon: Coupon | null, context: CouponContext): CouponVerdict {
    if (!coupon || !coupon.active) return fail("COUPON_INVALID", "This code is not valid.");
    if (!coupon.hasStarted(context.now)) return fail("COUPON_INVALID", "This code is not active yet.");
    if (coupon.hasExpired(context.now)) return fail("COUPON_EXPIRED", "This code has expired.");
    if (!context.subtotal.greaterThanOrEqual(coupon.minBasket)) {
      return fail("COUPON_MIN_BASKET", `Spend at least ${formatEuros(coupon.minBasket.cents)} to use this code.`);
    }
    if (coupon.isExhausted()) return fail("COUPON_EXHAUSTED", "This code has been fully redeemed.");
    if (coupon.oncePerCustomer && context.customerKey && context.alreadyUsedByCustomer) return fail("COUPON_ALREADY_USED", "You have already used this code.");
    const discount = coupon.discountFor(context.subtotal);
    return { satisfied: true, discount, message: `${coupon.code} applied: ${formatEuros(discount.cents)} off.` };
  }

  /** Returns the discount or throws the DomainError for the first unmet rule. */
  static assertSatisfiedBy(coupon: Coupon | null, context: CouponContext): Money {
    const verdict = CouponSpecification.evaluate(coupon, context);
    if (!verdict.satisfied) throw new DomainError(verdict.code, verdict.message, { couponCode: coupon?.code ?? null });
    return verdict.discount;
  }
}

const fail = (code: CouponErrorCode, message: string): CouponVerdict => ({ satisfied: false, code, message });
