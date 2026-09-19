import type { AdminStockDto, PublicStockDto, StockMovementDto } from "@meridian/contracts";
import { Injectable } from "@nestjs/common";
import { InventoryReadModel } from "../../application/ports";
import { PrismaService } from "../prisma.service";

const available = (row: { onHand: number; reserved: number }) => Math.max(0, row.onHand - row.reserved);

@Injectable()
export class PrismaInventoryReadModel extends InventoryReadModel {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listPublicStock(): Promise<PublicStockDto[]> {
    const rows = await this.prisma.stockItem.findMany({ select: { sku: true, onHand: true, reserved: true }, orderBy: { sku: "asc" } });
    return rows.map((row) => ({ sku: row.sku, available: available(row) }));
  }

  async findPublicStock(sku: string): Promise<PublicStockDto | null> {
    const row = await this.prisma.stockItem.findUnique({ where: { sku }, select: { sku: true, onHand: true, reserved: true } });
    return row ? { sku: row.sku, available: available(row) } : null;
  }

  async listAdminStock(): Promise<AdminStockDto[]> {
    const rows = await this.prisma.stockItem.findMany({ orderBy: { sku: "asc" } });
    return rows.map((row) => ({ sku: row.sku, onHand: row.onHand, reserved: row.reserved, available: available(row), updatedAt: row.updatedAt.toISOString() }));
  }

  async stockExists(sku: string): Promise<boolean> {
    return (await this.prisma.stockItem.count({ where: { sku } })) > 0;
  }

  async listMovements(sku: string, limit: number): Promise<StockMovementDto[]> {
    const rows = await this.prisma.stockMovement.findMany({ where: { sku }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      delta: row.delta,
      onHandAfter: row.onHandAfter,
      reason: row.reason,
      actorId: row.actorId,
      orderId: row.orderId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async findExpiredHolds(cutoff: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.reservation.findMany({
      where: { status: "held", expiresAt: { lte: cutoff } },
      orderBy: { expiresAt: "asc" },
      take: limit,
      select: { orderId: true },
    });
    return rows.map((row) => row.orderId);
  }
}
