import { Injectable } from "@nestjs/common";
import { AnalyticsReadModel } from "../../application/ports";
import type { DailySalesRow, ProductSalesRow } from "../../domain";
import { PrismaService } from "../prisma.service";

const toNumber = (value: bigint): number => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error("analytics amount exceeds the safe integer range");
  return n;
};

@Injectable()
export class PrismaAnalyticsReadModel extends AnalyticsReadModel {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async dailySales(from: string, to: string): Promise<DailySalesRow[]> {
    const rows = await this.prisma.dailySales.findMany({ where: { day: { gte: from, lte: to } }, orderBy: { day: "asc" } });
    return rows.map((row) => ({
      day: row.day,
      ordersPlaced: row.ordersPlaced,
      ordersPaid: row.ordersPaid,
      ordersCancelled: row.ordersCancelled,
      grossCents: toNumber(row.grossCents),
      refundsCents: toNumber(row.refundsCents),
    }));
  }

  async cancellations(from: string, to: string): Promise<Array<{ reason: string; count: number }>> {
    const rows = await this.prisma.cancellationStats.groupBy({ by: ["reason"], where: { day: { gte: from, lte: to } }, _sum: { count: true } });
    return rows.map((row) => ({ reason: row.reason, count: row._sum.count ?? 0 }));
  }

  async productSales(from: string, to: string): Promise<ProductSalesRow[]> {
    const rows = await this.prisma.productSales.findMany({ where: { day: { gte: from, lte: to } }, orderBy: [{ day: "asc" }, { sku: "asc" }] });
    return rows.map((row) => ({ sku: row.sku, slug: row.slug, productName: row.productName, units: row.units, revenueCents: toNumber(row.revenueCents) }));
  }

  async lastEventAt(consumer: string): Promise<Date | null> {
    const row = await this.prisma.projectionState.findUnique({ where: { projector: consumer }, select: { lastEventAt: true } });
    return row?.lastEventAt ?? null;
  }
}
