import { randomBytes, randomUUID } from "node:crypto";

/** Identifier policy of the payment context. */
export const PaymentIds = {
  payment: () => `pay_${randomUUID()}`,
  /** Meridian transaction id: unguessable, safe to show to the shopper's browser. */
  transaction: () => `txn_${randomBytes(16).toString("hex")}`,
  /** Refunds recorded when a captured payment is voided: the first is `void_<paymentId>`, later top-ups get a sequence. */
  voidRefund: (paymentId: string, sequence = 1) => (sequence === 1 ? `void_${paymentId}` : `void_${paymentId}_${sequence}`),
};
