import type { EventPayloads } from "@meridian/contracts";
import type { DomainEvent } from "@meridian/kernel";

export type InventoryEventName =
  | "StockReserved"
  | "StockReservationReleased"
  | "StockCommitted"
  | "StockAdjusted"
  | "StockDepleted"
  | "StockReplenished";

/** A domain event of the inventory bounded context, typed by the frozen contract payloads. */
export type InventoryEvent = { [N in InventoryEventName]: DomainEvent<N, EventPayloads[N]> }[InventoryEventName];

export const StockItemAggregate = "StockItem";
export const ReservationAggregate = "Reservation";

export function inventoryEvent<N extends InventoryEventName>(
  name: N,
  aggregateType: string,
  aggregateId: string,
  payload: EventPayloads[N],
  occurredAt: Date,
): InventoryEvent {
  return { name, aggregateType, aggregateId, payload, occurredAt } as InventoryEvent;
}
