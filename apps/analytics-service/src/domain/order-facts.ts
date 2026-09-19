import type { CancellationReason } from "@meridian/contracts";

/** A paid or placed order line, as far as analytics cares. */
export interface SoldLine {
  sku: string;
  slug: string;
  productName: string;
  qty: number;
  lineTotalCents: number;
}

/** The business facts the projector folds into the read model, decoupled from the wire envelope. */
export type OrderFact =
  | { kind: "placed"; orderId: string; at: Date; totalCents: number }
  | { kind: "paid"; orderId: string; at: Date; totalCents: number; lines: SoldLine[] }
  | { kind: "cancelled"; orderId: string; at: Date; reason: CancellationReason | string }
  | { kind: "refunded"; orderId: string; at: Date; amountCents: number; totalRefundedCents: number }
  | { kind: "payment-failed"; orderId: string; at: Date };
