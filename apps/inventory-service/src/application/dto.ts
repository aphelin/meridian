import type { AdminStockDto, ReservationDto } from "@meridian/contracts";
import type { Reservation, StockItem } from "../domain";

export function toReservationDto(reservation: Reservation): ReservationDto {
  return { orderId: reservation.orderId, status: reservation.status, lines: reservation.lines.toJSON(), expiresAt: reservation.expiresAt.toISOString() };
}

export function toAdminStockDto(item: StockItem): AdminStockDto {
  return { sku: item.sku, onHand: item.onHand, reserved: item.reserved, available: item.available, updatedAt: item.updatedAt.toISOString() };
}
