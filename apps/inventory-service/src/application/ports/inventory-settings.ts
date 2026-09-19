export interface InventorySettings {
  /** RESERVATION_HOLD_SECONDS (default 900). */
  holdSeconds: number;
  /** RESERVATION_GRACE_SECONDS (default 300): extra time before the sweep releases an expired hold. */
  graceSeconds: number;
  /** RESERVATION_SWEEP_MS (default 60000). */
  sweepMs: number;
  /** Holds released per sweep run. */
  sweepBatch: number;
  /** DEFAULT_STOCK_ON_HAND (default 8): opening stock for SKUs discovered from the catalog. */
  defaultOnHand: number;
}

export const INVENTORY_SETTINGS = Symbol("INVENTORY_SETTINGS");
