import { AggregateRoot, DomainError, ValidationError, ensure } from "@meridian/kernel";
import { OutOfStockError } from "../errors";
import { inventoryEvent, StockItemAggregate, type InventoryEvent } from "../events";
import { assertQuantity, assertStockLevel, Sku } from "./sku";
import { MovementReasons, type StockMovement } from "./stock-movement";

export interface StockItemState {
  sku: string;
  onHand: number;
  reserved: number;
  updatedAt: Date;
}

export type Adjustment = { onHand: number; delta?: undefined } | { delta: number; onHand?: undefined };

/**
 * Stock of one SKU. Invariants: 0 <= reserved <= onHand. available = onHand - reserved.
 * Every onHand change records a StockMovement; available crossing zero raises StockDepleted / StockReplenished.
 */
export class StockItem extends AggregateRoot<InventoryEvent> {
  private movements: StockMovement[] = [];

  private constructor(
    readonly sku: string,
    private _onHand: number,
    private _reserved: number,
    private _updatedAt: Date,
  ) {
    super();
  }

  /** A new SKU with its opening stock (records an initial movement when onHand > 0). */
  static create(sku: string, onHand: number, now: Date): StockItem {
    const code = Sku.of(sku).value;
    assertStockLevel(onHand, "opening stock");
    const item = new StockItem(code, onHand, 0, now);
    if (onHand > 0) item.record(onHand, MovementReasons.initial, null, null, now);
    return item;
  }

  /**
   * Opening stock for a SKU the catalog introduces (amendment 1p): a product published as sold out (merchandising
   * stop-sell) opens at 0; otherwise the configured default. It only applies to rows being created.
   */
  static openingOnHandForCatalog(defaultOnHand: number, productSoldOut: boolean): number {
    assertStockLevel(defaultOnHand, "default opening stock");
    return productSoldOut ? 0 : defaultOnHand;
  }

  static restore(state: StockItemState): StockItem {
    ensure(state.onHand >= 0 && state.reserved >= 0 && state.reserved <= state.onHand, "CONFLICT", `Stock record for ${state.sku} is inconsistent.`);
    return new StockItem(state.sku, state.onHand, state.reserved, state.updatedAt);
  }

  get onHand() {
    return this._onHand;
  }

  get reserved() {
    return this._reserved;
  }

  get available() {
    return this._onHand - this._reserved;
  }

  get updatedAt() {
    return this._updatedAt;
  }

  canReserve(qty: number): boolean {
    return this.available >= qty;
  }

  /** Holds `qty` units for an order. Throws OUT_OF_STOCK when fewer are available. */
  reserve(qty: number, now: Date): void {
    assertQuantity(qty);
    if (!this.canReserve(qty)) throw new OutOfStockError(this.sku, this.available, qty);
    this.change(() => {
      this._reserved += qty;
    }, now);
  }

  /** Returns held units to available stock. */
  releaseHold(qty: number, now: Date): void {
    assertQuantity(qty);
    ensure(this._reserved >= qty, "CONFLICT", `Cannot release ${qty} of ${this.sku}: only ${this._reserved} reserved.`);
    this.change(() => {
      this._reserved -= qty;
    }, now);
  }

  /** Ships held units: onHand and reserved both drop, so available is unchanged. */
  commitHold(qty: number, orderId: string, now: Date): void {
    assertQuantity(qty);
    ensure(this._reserved >= qty, "CONFLICT", `Cannot commit ${qty} of ${this.sku}: only ${this._reserved} reserved.`);
    this.change(() => {
      this._reserved -= qty;
      this._onHand -= qty;
    }, now);
    this.record(-qty, MovementReasons.commit, null, orderId, now);
  }

  /** Goods came back (return or cancelled shipment). Raises StockAdjusted. */
  restock(qty: number, orderId: string | null, now: Date): void {
    assertQuantity(qty);
    assertStockLevel(this._onHand + qty, "resulting stock level");
    const previousAvailable = this.available;
    this.change(() => {
      this._onHand += qty;
    }, now);
    this.record(qty, MovementReasons.restock, null, orderId, now);
    this.raiseAdjusted(previousAvailable, null, MovementReasons.restock, now);
  }

  /** Admin correction to an absolute level or by a delta. onHand may never drop below what is reserved. Returns false when nothing changed. */
  adjust(adjustment: Adjustment, reason: string, actorId: string | null, now: Date): boolean {
    const why = reason.trim();
    if (!why || why.length > 200) throw new ValidationError("A reason of 1 to 200 characters is required.");
    const target = adjustment.onHand !== undefined ? adjustment.onHand : this._onHand + adjustment.delta;
    if (adjustment.delta !== undefined && (!Number.isSafeInteger(adjustment.delta) || adjustment.delta === 0)) {
      throw new ValidationError("The delta must be a non-zero whole number.");
    }
    assertStockLevel(target, "resulting stock level");
    if (target < this._reserved) {
      throw new DomainError("CONFLICT", `${this.sku} has ${this._reserved} units reserved; stock cannot go below that.`, { sku: this.sku, reserved: this._reserved });
    }
    const delta = target - this._onHand;
    if (delta === 0) return false;
    const previousAvailable = this.available;
    this.change(() => {
      this._onHand = target;
    }, now);
    this.record(delta, why, actorId, null, now);
    this.raiseAdjusted(previousAvailable, actorId, why, now);
    return true;
  }

  /** Movements recorded since the last call; the repository persists them with the item. */
  pullMovements(): StockMovement[] {
    const movements = this.movements;
    this.movements = [];
    return movements;
  }

  snapshot(): StockItemState {
    return { sku: this.sku, onHand: this._onHand, reserved: this._reserved, updatedAt: this._updatedAt };
  }

  private change(mutate: () => void, now: Date) {
    const before = this.available;
    mutate();
    this._updatedAt = now;
    const after = this.available;
    if (before > 0 && after === 0) this.raise(inventoryEvent("StockDepleted", StockItemAggregate, this.sku, { sku: this.sku }, now));
    if (before === 0 && after > 0) this.raise(inventoryEvent("StockReplenished", StockItemAggregate, this.sku, { sku: this.sku, available: after }, now));
  }

  private record(delta: number, reason: string, actorId: string | null, orderId: string | null, now: Date) {
    this.movements.push({ sku: this.sku, delta, onHandAfter: this._onHand, reason, actorId, orderId, occurredAt: now });
  }

  private raiseAdjusted(previousAvailable: number, actorId: string | null, reason: string, now: Date) {
    this.raise(
      inventoryEvent(
        "StockAdjusted",
        StockItemAggregate,
        this.sku,
        { sku: this.sku, onHand: this._onHand, reserved: this._reserved, available: this.available, previousAvailable, actorId, reason },
        now,
      ),
    );
  }
}
