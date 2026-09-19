import type { TransactionContext } from "../shared/transaction";
import type { Cart } from "./cart";

export abstract class CartRepository {
  abstract findById(id: string, tx?: TransactionContext): Promise<Cart | null>;
  abstract findByUserId(userId: string, tx?: TransactionContext): Promise<Cart | null>;
  /** Inserts a new cart or updates a loaded one; a stale version throws ConcurrencyConflictError. */
  abstract save(cart: Cart, tx?: TransactionContext): Promise<void>;
  abstract deleteByUserId(userId: string, tx?: TransactionContext): Promise<number>;
  /** Deletes guest carts not updated since `before`. Returns how many. */
  abstract purgeGuestCartsIdleSince(before: Date): Promise<number>;
}
