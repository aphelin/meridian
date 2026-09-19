import type { Transaction } from "../shared/transaction";
import type { Wishlist } from "./wishlist";

export abstract class WishlistRepository {
  /** Loads the wishlist and locks it for the rest of the transaction, so concurrent edits from two devices serialise. */
  abstract loadForUpdate(userId: string, tx: Transaction): Promise<Wishlist>;
  abstract save(wishlist: Wishlist, tx: Transaction): Promise<void>;
  abstract deleteByUser(userId: string, tx: Transaction): Promise<number>;
}
