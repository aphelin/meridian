import type { CouponType } from "@meridian/contracts";
import { AggregateRoot, ensure, Money } from "@meridian/kernel";
import { type ContractEvent, contractEvent } from "../shared/events";
import { newId } from "../shared/ids";
import { CouponSpecification, type CouponContext } from "./coupon-specification";

export interface CouponProps {
  code: string;
  type: CouponType;
  /** Percent (1–100) or cents. */
  value: number;
  minBasketCents: number;
  maxRedemptions: number | null;
  redemptions: number;
  oncePerCustomer: boolean;
  active: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
}

export type CouponPatch = Partial<Pick<CouponProps, "type" | "value" | "minBasketCents" | "maxRedemptions" | "oncePerCustomer" | "active" | "startsAt" | "expiresAt">>;

/** One use of a coupon by an order. `onceKey` is set for once-per-customer coupons so storage can enforce uniqueness. */
export interface CouponRedemption {
  id: string;
  couponCode: string;
  orderId: string;
  customerKey: string;
  onceKey: string | null;
  discountCents: number;
}

const CODE = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

export class Coupon extends AggregateRoot<ContractEvent> {
  private constructor(private props: CouponProps) {
    super();
  }

  /** Codes are case-insensitive: stored and compared upper case. */
  static normalizeCode(raw: string): string {
    return raw.trim().toUpperCase();
  }

  /** Customer identity for once-per-customer: the user id when signed in, otherwise the lower-cased email. */
  static customerKey(userId: string | null, email: string | null | undefined): string | null {
    if (userId) return userId;
    const normalized = email?.trim().toLowerCase();
    return normalized || null;
  }

  static create(input: Omit<CouponProps, "redemptions"> & { redemptions?: number }): Coupon {
    const props: CouponProps = { ...input, code: Coupon.normalizeCode(input.code), redemptions: input.redemptions ?? 0 };
    ensure(CODE.test(props.code), "VALIDATION_FAILED", "Coupon codes use 2–32 letters, digits, dashes or underscores.");
    Coupon.assertValidTerms(props);
    return new Coupon(props);
  }

  private static assertValidTerms(props: CouponProps): void {
    if (props.type === "percent") ensure(Number.isInteger(props.value) && props.value >= 1 && props.value <= 100, "VALIDATION_FAILED", "A percent coupon is worth 1–100%.");
    else ensure(props.type === "fixed" && Number.isSafeInteger(props.value) && props.value > 0, "VALIDATION_FAILED", "A fixed coupon is worth a positive number of cents.");
    ensure(Number.isSafeInteger(props.minBasketCents) && props.minBasketCents >= 0, "VALIDATION_FAILED", "Minimum basket cannot be negative.");
    ensure(props.maxRedemptions === null || (Number.isInteger(props.maxRedemptions) && props.maxRedemptions >= 1), "VALIDATION_FAILED", "Maximum redemptions must be at least 1.");
    ensure(!props.startsAt || !props.expiresAt || props.startsAt < props.expiresAt, "VALIDATION_FAILED", "A coupon must start before it expires.");
  }

  /**
   * Changes the coupon's terms (code and redemption count never change). The result is validated as a whole, so a
   * patch cannot produce e.g. a 150% coupon by switching the type alone. Returns the names of the changed fields.
   */
  update(patch: CouponPatch): (keyof CouponPatch)[] {
    const next: CouponProps = { ...this.props };
    const changed: (keyof CouponPatch)[] = [];
    for (const key of Object.keys(patch) as (keyof CouponPatch)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      const current = this.props[key];
      const same = current instanceof Date && value instanceof Date ? current.getTime() === value.getTime() : current === value;
      if (same) continue;
      (next as unknown as Record<string, unknown>)[key] = value;
      changed.push(key);
    }
    Coupon.assertValidTerms(next);
    this.props = next;
    return changed;
  }

  static restore(props: CouponProps): Coupon {
    return new Coupon({ ...props });
  }

  get code() {
    return this.props.code;
  }
  get type() {
    return this.props.type;
  }
  get value() {
    return this.props.value;
  }
  get minBasket(): Money {
    return Money.cents(this.props.minBasketCents);
  }
  get maxRedemptions() {
    return this.props.maxRedemptions;
  }
  get redemptions() {
    return this.props.redemptions;
  }
  get oncePerCustomer() {
    return this.props.oncePerCustomer;
  }
  get active() {
    return this.props.active;
  }
  get startsAt() {
    return this.props.startsAt;
  }
  get expiresAt() {
    return this.props.expiresAt;
  }

  snapshot(): CouponProps {
    return { ...this.props };
  }

  hasStarted(now: Date): boolean {
    return !this.props.startsAt || this.props.startsAt <= now;
  }

  hasExpired(now: Date): boolean {
    return !!this.props.expiresAt && this.props.expiresAt <= now;
  }

  isExhausted(): boolean {
    return this.props.maxRedemptions !== null && this.props.redemptions >= this.props.maxRedemptions;
  }

  /** Discount for a basket subtotal: percent of it, or the fixed amount capped at the subtotal. */
  discountFor(subtotal: Money): Money {
    if (this.props.type === "percent") return subtotal.percent(this.props.value).min(subtotal);
    return Money.cents(this.props.value).min(subtotal);
  }

  /**
   * Redeems the coupon for an order. Runs the full specification (throws the COUPON_* code) and raises
   * CouponRedeemed. Storage re-checks the global limit and once-per-customer atomically.
   */
  redeem(orderId: string, context: CouponContext & { customerKey: string }): CouponRedemption {
    const discount = CouponSpecification.assertSatisfiedBy(this, context);
    this.props.redemptions += 1;
    const redemption: CouponRedemption = {
      id: newId(),
      couponCode: this.props.code,
      orderId,
      customerKey: context.customerKey,
      onceKey: this.props.oncePerCustomer ? context.customerKey : null,
      discountCents: discount.cents,
    };
    this.raise(
      contractEvent("CouponRedeemed", "Coupon", this.props.code, { couponCode: this.props.code, orderId, customerKey: context.customerKey, discountCents: discount.cents }, context.now),
    );
    return redemption;
  }
}
