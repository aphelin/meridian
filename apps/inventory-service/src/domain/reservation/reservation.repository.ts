import type { Reservation } from "./reservation";

/** Persistence port for Reservation, bound to one unit of work (transaction). */
export abstract class ReservationRepository {
  /**
   * Serialises every writer of this order's reservation until the transaction ends (advisory lock on the orderId,
   * always taken before any stock row lock) and loads the reservation; null when none exists.
   */
  abstract lockByOrderId(orderId: string): Promise<Reservation | null>;
  /** Inserts or updates the reservation and its lines. */
  abstract save(reservation: Reservation): Promise<void>;
}
