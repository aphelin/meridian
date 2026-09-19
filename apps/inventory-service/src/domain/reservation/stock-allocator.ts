import { OutOfStockError } from "../errors";
import type { StockItem } from "../stock/stock-item";
import { Reservation } from "./reservation";
import type { StockLines } from "../stock/stock-lines";

/**
 * Domain service: reserves every line of an order or none. All lines are checked before any StockItem changes, so a
 * failed reservation leaves stock untouched even before the transaction rolls back.
 */
export const StockAllocator = {
  allocate(orderId: string, lines: StockLines, items: ReadonlyMap<string, StockItem>, now: Date, holdSeconds: number): Reservation {
    for (const line of lines.items) {
      const item = items.get(line.sku);
      if (!item) throw new OutOfStockError(line.sku, 0, line.qty);
      if (!item.canReserve(line.qty)) throw new OutOfStockError(line.sku, item.available, line.qty);
    }
    for (const line of lines.items) items.get(line.sku)!.reserve(line.qty, now);
    return Reservation.hold(orderId, lines, now, holdSeconds);
  },
};
