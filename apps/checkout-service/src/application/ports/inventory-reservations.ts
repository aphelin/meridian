import type { SkuQty } from "@meridian/contracts";

/**
 * Stock holds in inventory-service. `reserve` is all-or-nothing and idempotent per order; it rejects with a DomainError
 * OUT_OF_STOCK when any line cannot be held. Unreachable inventory rejects with UPSTREAM_UNAVAILABLE.
 */
export abstract class InventoryReservations {
  abstract reserve(orderId: string, lines: SkuQty[]): Promise<void>;
  abstract commit(orderId: string): Promise<void>;
}
