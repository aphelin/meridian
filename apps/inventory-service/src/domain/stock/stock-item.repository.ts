import type { StockItem } from "./stock-item";

/**
 * Persistence port for StockItem, bound to one unit of work (transaction).
 * Implementations take row locks: callers lock SKUs one by one in ascending order so concurrent writers never deadlock.
 */
export abstract class StockItemRepository {
  /** Locks the row (SELECT … FOR UPDATE) and loads it; null when the SKU does not exist. */
  abstract lock(sku: string): Promise<StockItem | null>;
  /** Inserts the item when the SKU does not exist yet; returns whether it was inserted. Never overwrites. */
  abstract insertIfMissing(item: StockItem): Promise<boolean>;
  /** Writes the item's state and appends the movements it recorded. */
  abstract save(item: StockItem): Promise<void>;
}
