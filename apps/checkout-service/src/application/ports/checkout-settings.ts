/** Tunables read from the environment by infrastructure. */
export abstract class CheckoutSettings {
  /** Minutes an unpaid order holds stock before it expires (ORDER_HOLD_MINUTES). */
  abstract readonly orderHoldMinutes: number;
  /** Lifetime of presigned invoice download links, in seconds. */
  abstract readonly invoiceLinkSeconds: number;
}
