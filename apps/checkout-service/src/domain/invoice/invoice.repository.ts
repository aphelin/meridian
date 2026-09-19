import type { TransactionContext } from "../shared/transaction";
import type { Invoice } from "./invoice";

export abstract class InvoiceRepository {
  abstract findByOrderId(orderId: string, tx?: TransactionContext): Promise<Invoice | null>;
  /** Next value of the invoice number sequence (never reused, even when the transaction rolls back). */
  abstract nextSequence(tx: TransactionContext): Promise<number>;
  /** Inserts the invoice unless the order already has one; returns the stored invoice either way. */
  abstract insertIfAbsent(invoice: Invoice, tx: TransactionContext): Promise<Invoice>;
  abstract save(invoice: Invoice, tx: TransactionContext): Promise<void>;
}
