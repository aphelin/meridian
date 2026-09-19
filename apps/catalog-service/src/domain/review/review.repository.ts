import type { Transaction } from "../shared/transaction";
import type { PurchaseRecord } from "./purchase-record";
import type { Review } from "./review";

export abstract class ReviewRepository {
  abstract existsFor(productId: string, userId: string, tx?: Transaction): Promise<boolean>;
  abstract findByUser(userId: string, tx: Transaction): Promise<Review[]>;
  abstract save(review: Review, tx: Transaction): Promise<void>;
}

export abstract class PurchaseRecordRepository {
  abstract find(userId: string, slug: string, tx?: Transaction): Promise<PurchaseRecord | null>;
  /** Inserts or keeps the earliest record for (userId, slug). */
  abstract record(record: PurchaseRecord, tx: Transaction): Promise<void>;
  abstract deleteByUser(userId: string, tx: Transaction): Promise<number>;
}
