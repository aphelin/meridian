import type { TransactionContext } from "../shared/transaction";
import type { Order } from "./order";

/** Raised when a new order's number collides with an existing one; the caller generates another number. */
export class DuplicateOrderNumberError extends Error {
  constructor(readonly number: string) {
    super(`Order number ${number} already exists`);
    this.name = "DuplicateOrderNumberError";
  }
}

export abstract class OrderRepository {
  abstract findById(id: string, tx?: TransactionContext): Promise<Order | null>;
  /** The order that holds the return request. */
  abstract findByReturnId(returnId: string, tx?: TransactionContext): Promise<Order | null>;
  abstract findByUserId(userId: string, tx?: TransactionContext): Promise<Order[]>;
  /**
   * Inserts a new order (DuplicateOrderNumberError on a number collision) or updates a loaded one guarded by its
   * version (ConcurrencyConflictError when it changed meanwhile).
   */
  abstract save(order: Order, tx: TransactionContext): Promise<void>;
  /** Ids of unpaid (`placed`) orders created at or before `placedBefore`, or whose payment deadline passed by `deadlineBefore`. */
  abstract findUnpaidIds(criteria: { placedBefore?: Date; deadlineBefore?: Date; limit: number }): Promise<string[]>;
}
