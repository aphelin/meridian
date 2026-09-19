import type { EventName, EventPayloads } from "@meridian/contracts";
import type { EventMeta } from "./event-meta";

export type StockEventName = Extract<EventName, "StockReserved" | "StockReservationReleased" | "StockCommitted" | "StockAdjusted" | "StockDepleted" | "StockReplenished">;
export const STOCK_EVENTS: readonly StockEventName[] = ["StockReserved", "StockReservationReleased", "StockCommitted", "StockAdjusted", "StockDepleted", "StockReplenished"];

/**
 * Whether one SKU can currently be bought, as last reported by inventory. Only events that state availability
 * count: StockAdjusted (available > 0), StockDepleted (false) and StockReplenished (true). Reservation events carry
 * quantities, not availability, and inventory follows them with Depleted/Replenished when availability flips.
 */
export class SkuAvailability {
  private constructor(
    readonly sku: string,
    readonly available: boolean,
    readonly lastEventId: string,
    readonly lastEventAt: Date,
  ) {}

  static restore(props: { sku: string; available: boolean; lastEventId: string; lastEventAt: Date }): SkuAvailability {
    return new SkuAvailability(props.sku, props.available, props.lastEventId, props.lastEventAt);
  }

  /** The availability an inventory event states, or null when the event does not carry availability. */
  static fromStockEvent<N extends StockEventName>(name: N, payload: EventPayloads[N], meta: EventMeta): SkuAvailability | null {
    switch (name) {
      case "StockDepleted": {
        const { sku } = payload as EventPayloads["StockDepleted"];
        return new SkuAvailability(sku, false, meta.messageId, meta.occurredAt);
      }
      case "StockReplenished": {
        const { sku } = payload as EventPayloads["StockReplenished"];
        return new SkuAvailability(sku, true, meta.messageId, meta.occurredAt);
      }
      case "StockAdjusted": {
        const { sku, available } = payload as EventPayloads["StockAdjusted"];
        return new SkuAvailability(sku, available > 0, meta.messageId, meta.occurredAt);
      }
      default:
        return null;
    }
  }

  /** Latest fact wins; an event at the same instant (same inventory transaction) follows log order. */
  supersedes(current: SkuAvailability | null): boolean {
    return !current || this.lastEventAt.getTime() >= current.lastEventAt.getTime();
  }
}

/**
 * A product is in stock when any of its variants is. A SKU inventory never reported on counts as in stock
 * (inventory creates stock for new SKUs), and a product without variants cannot be bought.
 * The read model evaluates the same rule in SQL; this is its executable specification.
 */
export function productInStock(skus: readonly string[], known: ReadonlyMap<string, boolean>): boolean {
  return skus.some((sku) => known.get(sku) !== false);
}
