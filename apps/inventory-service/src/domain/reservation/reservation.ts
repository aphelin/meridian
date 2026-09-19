import type { SkuQty } from "@meridian/contracts";
import { AggregateRoot, DomainError, ValidationError } from "@meridian/kernel";
import { inventoryEvent, ReservationAggregate, type InventoryEvent } from "../events";
import { StockLines } from "../stock/stock-lines";

export type ReservationStatus = "held" | "committed" | "released";
export type ReleaseReason = "cancelled" | "expired" | "payment-failed";

export interface ReservationState {
  orderId: string;
  status: ReservationStatus;
  lines: SkuQty[];
  expiresAt: Date;
  releaseReason: ReleaseReason | null;
}

const ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;

export function assertOrderId(orderId: unknown): asserts orderId is string {
  if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) throw new ValidationError("Invalid order id.");
}

/**
 * A hold on stock for one order. Lifecycle: held → committed | released; both end states are terminal.
 * Repeating the transition that produced the current state is a no-op (idempotent), the other one is INVALID_TRANSITION.
 */
export class Reservation extends AggregateRoot<InventoryEvent> {
  private constructor(
    readonly orderId: string,
    readonly lines: StockLines,
    private _status: ReservationStatus,
    readonly expiresAt: Date,
    private _releaseReason: ReleaseReason | null,
  ) {
    super();
  }

  /** Raises StockReserved. The caller (StockAllocator) has already held every line on its StockItem. */
  static hold(orderId: string, lines: StockLines, now: Date, holdSeconds: number): Reservation {
    assertOrderId(orderId);
    if (!Number.isSafeInteger(holdSeconds) || holdSeconds < 1) throw new ValidationError("Hold length must be at least one second.");
    const expiresAt = new Date(now.getTime() + holdSeconds * 1000);
    const reservation = new Reservation(orderId, lines, "held", expiresAt, null);
    reservation.raise(inventoryEvent("StockReserved", ReservationAggregate, orderId, { orderId, lines: lines.toJSON(), expiresAt: expiresAt.toISOString() }, now));
    return reservation;
  }

  static restore(state: ReservationState): Reservation {
    return new Reservation(state.orderId, StockLines.of(state.lines), state.status, state.expiresAt, state.releaseReason);
  }

  get status() {
    return this._status;
  }

  get releaseReason() {
    return this._releaseReason;
  }

  isHeld() {
    return this._status === "held";
  }

  /** True once the hold is past expiresAt plus the grace period. */
  isExpired(now: Date, graceSeconds: number): boolean {
    return this.isHeld() && now.getTime() >= this.expiresAt.getTime() + graceSeconds * 1000;
  }

  /** held → committed (raises StockCommitted); returns false when already committed. */
  commit(now: Date): boolean {
    if (this._status === "committed") return false;
    if (this._status !== "held") throw new DomainError("INVALID_TRANSITION", `Reservation for order ${this.orderId} was released and cannot be committed.`, { orderId: this.orderId, status: this._status });
    this._status = "committed";
    this.raise(inventoryEvent("StockCommitted", ReservationAggregate, this.orderId, { orderId: this.orderId, lines: this.lines.toJSON() }, now));
    return true;
  }

  /** held → released (raises StockReservationReleased); returns false when already released. */
  release(reason: ReleaseReason, now: Date): boolean {
    if (this._status === "released") return false;
    if (this._status !== "held") throw new DomainError("INVALID_TRANSITION", `Reservation for order ${this.orderId} was committed and cannot be released.`, { orderId: this.orderId, status: this._status });
    this._status = "released";
    this._releaseReason = reason;
    this.raise(inventoryEvent("StockReservationReleased", ReservationAggregate, this.orderId, { orderId: this.orderId, lines: this.lines.toJSON(), reason }, now));
    return true;
  }

  snapshot(): ReservationState {
    return { orderId: this.orderId, status: this._status, lines: this.lines.toJSON(), expiresAt: this.expiresAt, releaseReason: this._releaseReason };
  }
}
