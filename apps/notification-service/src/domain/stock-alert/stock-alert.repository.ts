import type { StockAlert } from "./stock-alert";

/** Persistence port for StockAlert, bound to one unit of work. */
export abstract class StockAlertRepository {
  /** Inserts unless a pending alert for the same email and SKU exists; returns whether it was inserted. */
  abstract insertIfNoPending(alert: StockAlert): Promise<boolean>;
  /** Locks up to `limit` pending alerts for the SKU, oldest first, skipping rows another transaction holds. */
  abstract lockPendingForSku(sku: string, limit: number): Promise<StockAlert[]>;
  abstract save(alert: StockAlert): Promise<void>;
  /** Removes every alert of the address (account deletion). Returns how many were removed. */
  abstract deleteByEmail(email: string): Promise<number>;
}
