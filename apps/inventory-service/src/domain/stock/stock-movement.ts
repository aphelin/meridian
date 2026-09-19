/** Why onHand changed. Admin adjustments carry the free-text reason the admin typed. */
export const MovementReasons = {
  initial: "initial-stock",
  commit: "order-committed",
  restock: "restock",
} as const;

/** An immutable record of one onHand change, written in the same transaction as the StockItem. */
export interface StockMovement {
  readonly sku: string;
  readonly delta: number;
  readonly onHandAfter: number;
  readonly reason: string;
  readonly actorId: string | null;
  readonly orderId: string | null;
  readonly occurredAt: Date;
}
