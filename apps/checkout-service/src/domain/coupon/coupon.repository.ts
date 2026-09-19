import type { TransactionContext } from "../shared/transaction";
import type { Coupon, CouponRedemption } from "./coupon";

export abstract class CouponRepository {
  abstract findByCode(code: string, tx?: TransactionContext): Promise<Coupon | null>;

  /** Whether `customerKey` holds a live redemption of the coupon (redemptions of cancelled orders are released). */
  abstract hasRedemption(code: string, customerKey: string, tx?: TransactionContext): Promise<boolean>;

  /**
   * Persists a redemption atomically: increments the counter only while under `maxRedemptions` (else COUPON_EXHAUSTED)
   * and inserts the redemption row, whose unique once-per-customer key rejects a concurrent second use
   * (COUPON_ALREADY_USED).
   */
  abstract recordRedemption(coupon: Coupon, redemption: CouponRedemption, tx: TransactionContext): Promise<void>;

  /** Gives back the redemption held by an order that did not go through. Returns whether one was released. */
  abstract releaseRedemption(orderId: string, tx: TransactionContext): Promise<boolean>;

  /** All coupons, newest first, with their live redemption counts. */
  abstract list(): Promise<Coupon[]>;

  /** Inserts a new coupon; a taken code is a ConflictError (409). */
  abstract create(coupon: Coupon, tx?: TransactionContext): Promise<void>;

  /** Writes the coupon's terms (never its redemption counter, which only redemptions change). */
  abstract updateTerms(coupon: Coupon, tx?: TransactionContext): Promise<void>;

  /** Inserts the coupon unless the code exists. Returns whether it was created. */
  abstract createIfMissing(coupon: Coupon, tx?: TransactionContext): Promise<boolean>;
}
