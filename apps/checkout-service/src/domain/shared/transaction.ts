/**
 * Opaque handle for one unit of work. The domain and application only pass it through to repositories and the
 * outbox; infrastructure decides what it is (a Prisma interactive transaction client).
 */
export interface TransactionContext {
  readonly __transaction: "TransactionContext";
}
