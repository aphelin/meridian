import { DomainError } from "@meridian/kernel";
import { StockItem, type StockLines } from "../../domain";
import type { InventoryTransaction } from "../ports";

/**
 * Locks the StockItems of `lines` one at a time in ascending SKU order (StockLines are sorted), the single lock order
 * every writer uses, so concurrent transactions queue instead of deadlocking. Missing SKUs are absent from the map.
 */
export async function lockStock(tx: InventoryTransaction, lines: StockLines): Promise<Map<string, StockItem>> {
  const items = new Map<string, StockItem>();
  for (const sku of lines.skus()) {
    const item = await tx.stock.lock(sku);
    if (item) items.set(sku, item);
  }
  return items;
}

/** Like lockStock, but creates missing SKUs with zero stock first (restock of a SKU that has no row yet). */
export async function lockOrCreateStock(tx: InventoryTransaction, lines: StockLines, now: Date): Promise<Map<string, StockItem>> {
  const items = new Map<string, StockItem>();
  for (const sku of lines.skus()) {
    let item = await tx.stock.lock(sku);
    if (!item) {
      await tx.stock.insertIfMissing(StockItem.create(sku, 0, now));
      item = await tx.stock.lock(sku);
    }
    if (!item) throw new DomainError("CONFLICT", `Stock for ${sku} could not be created.`);
    items.set(sku, item);
  }
  return items;
}

export function requireLocked(items: Map<string, StockItem>, sku: string): StockItem {
  const item = items.get(sku);
  if (!item) throw new DomainError("CONFLICT", `Stock record for ${sku} is missing.`, { sku });
  return item;
}

/** Persists every item and collects its events in lock order. */
export async function saveAll(tx: InventoryTransaction, items: Map<string, StockItem>) {
  const events = [];
  for (const item of items.values()) {
    await tx.stock.save(item);
    events.push(...item.pullEvents());
  }
  return events;
}
