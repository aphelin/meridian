import type { SkuQty } from "@meridian/contracts";
import { ValidationError } from "@meridian/kernel";
import { assertQuantity, MAX_UNITS, Sku } from "./sku";

export const MAX_STOCK_LINES = 100;

/**
 * Lines of SKU quantities (a reservation or a restock): duplicate SKUs merged, sorted by SKU (the lock order), each quantity positive.
 */
export class StockLines {
  private constructor(readonly items: readonly SkuQty[]) {}

  static of(lines: readonly SkuQty[]): StockLines {
    if (!Array.isArray(lines) || lines.length === 0) throw new ValidationError("At least one line is required.");
    if (lines.length > MAX_STOCK_LINES) throw new ValidationError(`At most ${MAX_STOCK_LINES} lines are allowed.`);
    const merged = new Map<string, number>();
    for (const line of lines) {
      const sku = Sku.of(line?.sku).value;
      assertQuantity(line.qty);
      const qty = (merged.get(sku) ?? 0) + line.qty;
      if (qty > MAX_UNITS) throw new ValidationError(`Too many units of ${sku}.`);
      merged.set(sku, qty);
    }
    const items = [...merged.entries()].map(([sku, qty]) => ({ sku, qty })).sort((a, b) => compareSku(a.sku, b.sku));
    return new StockLines(items);
  }

  /** SKUs in lock order. */
  skus(): string[] {
    return this.items.map((line) => line.sku);
  }

  equals(other: StockLines): boolean {
    return this.items.length === other.items.length && this.items.every((line, i) => line.sku === other.items[i].sku && line.qty === other.items[i].qty);
  }

  toJSON(): SkuQty[] {
    return this.items.map((line) => ({ ...line }));
  }
}

/** Byte-wise ordering, identical in every process, so all writers acquire row locks in the same order. */
export function compareSku(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
