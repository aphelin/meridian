import type { AdminStockDto, PublicStockDto, StockMovementDto } from "@meridian/contracts";

/** Query side: plain DTO reads without aggregates or locks. */
export abstract class InventoryReadModel {
  abstract listPublicStock(): Promise<PublicStockDto[]>;
  abstract findPublicStock(sku: string): Promise<PublicStockDto | null>;
  abstract listAdminStock(): Promise<AdminStockDto[]>;
  abstract stockExists(sku: string): Promise<boolean>;
  abstract listMovements(sku: string, limit: number): Promise<StockMovementDto[]>;
  /** Order ids of holds whose expiresAt is at or before `cutoff`, oldest first. */
  abstract findExpiredHolds(cutoff: Date, limit: number): Promise<string[]>;
}
