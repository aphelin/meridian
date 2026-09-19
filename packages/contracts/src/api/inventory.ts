import type { IsoDateTime, SkuQty } from "../common";

export interface PublicStockDto {
  sku: string;
  available: number;
}

export interface AdminStockDto {
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  updatedAt: IsoDateTime;
}

export interface ReservationRequest {
  orderId: string;
  lines: SkuQty[];
}

export interface ReservationDto {
  orderId: string;
  status: "held" | "committed" | "released";
  lines: SkuQty[];
  expiresAt: IsoDateTime;
}

export interface StockMovementDto {
  id: string;
  sku: string;
  delta: number;
  onHandAfter: number;
  reason: string;
  actorId: string | null;
  orderId: string | null;
  createdAt: IsoDateTime;
}
