export interface PaymentSettings {
  /** How long one worker owns a refund's provider call before another may retry it. */
  refundDispatchLeaseMs: number;
}

export const PAYMENT_SETTINGS = Symbol("PAYMENT_SETTINGS");
