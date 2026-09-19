import type { ReleaseReason, Reservation } from "../../domain";
import type { InventoryTransaction } from "../ports";
import { lockStock, requireLocked, saveAll } from "./stock-locking";

/**
 * held → released inside an open transaction whose order lock is already held: returns every line to available stock
 * (StockReplenished when a SKU goes 0 → >0) and writes StockReservationReleased. Returns false when already released.
 */
export async function releaseReservation(tx: InventoryTransaction, reservation: Reservation, reason: ReleaseReason, now: Date): Promise<boolean> {
  if (!reservation.release(reason, now)) return false;
  const items = await lockStock(tx, reservation.lines);
  for (const line of reservation.lines.items) requireLocked(items, line.sku).releaseHold(line.qty, now);
  const stockEvents = await saveAll(tx, items);
  await tx.reservations.save(reservation);
  await tx.publish([...reservation.pullEvents(), ...stockEvents]);
  return true;
}
