import type { Payment } from "./payment";

/** How to find (and row-lock) a payment inside a unit of work. */
export type PaymentLookup =
  | { orderId: string }
  | { id: string }
  | { transactionId: string }
  | { providerTransactionId: string }
  | { providerRefundId: string };

/**
 * Transaction-bound repository. `lock` takes a row lock (and, for orderId lookups, an order-scoped lock that also
 * serialises creation), so concurrent writers of one payment run one after another.
 */
export abstract class PaymentRepository {
  abstract lock(lookup: PaymentLookup): Promise<Payment | null>;
  abstract insert(payment: Payment): Promise<void>;
  abstract save(payment: Payment): Promise<void>;
}
