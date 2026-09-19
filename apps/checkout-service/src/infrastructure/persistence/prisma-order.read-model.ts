import type { AdminOrderListDto, CustomerRef, OrderStatus, OrderSummaryDto, Page, SkuQty } from "@meridian/contracts";
import { Injectable } from "@nestjs/common";
import { type AdminOrderFilter, type AdminReturnDto, OrderReadModel, type ReturnFilter } from "../../application/ports";
import type { Prisma } from "../../generated/prisma";
import { afterCursor, decodeCursor, encodeCursor } from "./cursor";
import { PrismaService } from "./prisma.service";

const summarySelect = {
  id: true,
  number: true,
  status: true,
  totalCents: true,
  createdAt: true,
  userId: true,
  customerEmail: true,
  customerName: true,
  lines: { orderBy: { position: "asc" }, select: { sku: true, slug: true, productName: true, qty: true } },
} satisfies Prisma.OrderSelect;
type SummaryRow = Prisma.OrderGetPayload<{ select: typeof summarySelect }>;

const toSummary = (row: SummaryRow): OrderSummaryDto => ({
  id: row.id,
  number: row.number,
  status: row.status as OrderStatus,
  totalCents: row.totalCents,
  itemCount: row.lines.reduce((sum, line) => sum + line.qty, 0),
  lines: row.lines,
  createdAt: row.createdAt.toISOString(),
});

const customerOf = (row: { userId: string | null; customerEmail: string; customerName: string }): CustomerRef => ({ userId: row.userId, email: row.customerEmail, name: row.customerName });

/** List queries read the denormalised order columns directly, without loading aggregates. Keyset pagination, newest first. */
@Injectable()
export class PrismaOrderReadModel extends OrderReadModel {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForUser(userId: string, limit: number): Promise<OrderSummaryDto[]> {
    const rows = await this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit, select: summarySelect });
    return rows.map(toSummary);
  }

  async listForAdmin(filter: AdminOrderFilter): Promise<AdminOrderListDto> {
    const cursor = decodeCursor(filter.cursor);
    const q = filter.q?.trim();
    const and: Prisma.OrderWhereInput[] = [afterCursor(cursor)];
    if (filter.status) and.push({ status: filter.status });
    if (q) {
      and.push({
        OR: [
          { number: { equals: q.toUpperCase() } },
          { customerEmail: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    const rows = await this.prisma.order.findMany({ where: { AND: and }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: filter.limit + 1, select: summarySelect });
    const page = rows.slice(0, filter.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({ ...toSummary(row), customer: customerOf(row) })),
      nextCursor: rows.length > filter.limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  async listReturns(filter: ReturnFilter): Promise<Page<AdminReturnDto>> {
    const cursor = decodeCursor(filter.cursor);
    const rows = await this.prisma.orderReturn.findMany({
      where: { AND: [afterCursor(cursor), filter.status ? { status: filter.status } : {}] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filter.limit + 1,
      include: { order: { select: { number: true, userId: true, customerEmail: true, customerName: true } } },
    });
    const page = rows.slice(0, filter.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        status: row.status as AdminReturnDto["status"],
        lines: row.lines as unknown as SkuQty[],
        reason: row.reason,
        refundCents: row.refundCents,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
        orderNumber: row.order.number,
        customer: customerOf(row.order),
      })),
      nextCursor: rows.length > filter.limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }
}
