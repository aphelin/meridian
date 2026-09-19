import type { CancellationReason, OrderStatus, PostalAddress, ShippingMethodId, SkuQty } from "@meridian/contracts";
import { Injectable } from "@nestjs/common";
import {
  ConcurrencyConflictError,
  DuplicateOrderNumberError,
  Order,
  type OrderProps,
  OrderRepository,
  type RefundStatus,
  type ReturnStatus,
  type TimelineStatus,
  type TransactionContext,
} from "../../domain";
import type { Prisma } from "../../generated/prisma";
import { isUniqueViolation } from "./prisma-errors";
import { type Db, PrismaService } from "./prisma.service";
import { dbOf } from "./prisma-unit-of-work";

const include = {
  lines: { orderBy: { position: "asc" } },
  timeline: { orderBy: { at: "asc" } },
  refunds: { orderBy: { createdAt: "asc" } },
  returns: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof include }>;

@Injectable()
export class PrismaOrderRepository extends OrderRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TransactionContext): Promise<Order | null> {
    const row = await dbOf(this.prisma, tx).order.findUnique({ where: { id }, include });
    return row ? toDomain(row) : null;
  }

  async findByReturnId(returnId: string, tx?: TransactionContext): Promise<Order | null> {
    const ret = await dbOf(this.prisma, tx).orderReturn.findUnique({ where: { id: returnId }, select: { orderId: true } });
    return ret ? this.findById(ret.orderId, tx) : null;
  }

  async findByUserId(userId: string, tx?: TransactionContext): Promise<Order[]> {
    const rows = await dbOf(this.prisma, tx).order.findMany({ where: { userId }, include, orderBy: { createdAt: "asc" } });
    return rows.map(toDomain);
  }

  async findUnpaidIds(criteria: { placedBefore?: Date; limit: number }): Promise<string[]> {
    const rows = await this.prisma.order.findMany({
      where: { status: "placed", ...(criteria.placedBefore ? { createdAt: { lte: criteria.placedBefore } } : {}) },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: criteria.limit,
    });
    return rows.map((row) => row.id);
  }

  async save(order: Order, tx: TransactionContext): Promise<void> {
    const db = dbOf(this.prisma, tx);
    const o = order.snapshot();
    if (order.isNew) await this.insert(db, o);
    else {
      const updated = await db.order.updateMany({ where: { id: o.id, version: o.version }, data: { ...headerColumns(o), version: { increment: 1 } } });
      if (updated.count === 0) throw new ConcurrencyConflictError("Order", o.id);
    }
    if (o.timeline.length) {
      await db.orderTimelineEntry.createMany({ data: o.timeline.map((entry) => ({ id: entry.id, orderId: o.id, status: entry.status, note: entry.note, at: entry.at })), skipDuplicates: true });
    }
    for (const refund of o.refunds) {
      const data = { amountCents: refund.amountCents, reason: refund.reason, status: refund.status, returnId: refund.returnId, failureReason: refund.failureReason, settledAt: refund.settledAt };
      await db.orderRefund.upsert({ where: { id: refund.id }, create: { id: refund.id, orderId: o.id, createdAt: refund.createdAt, ...data }, update: data });
    }
    for (const ret of o.returns) {
      const data = { status: ret.status, lines: ret.lines as unknown as Prisma.InputJsonValue, reason: ret.reason, refundCents: ret.refundCents, restock: ret.restock, note: ret.note, decidedAt: ret.decidedAt };
      await db.orderReturn.upsert({ where: { id: ret.id }, create: { id: ret.id, orderId: o.id, createdAt: ret.createdAt, ...data }, update: data });
    }
  }

  private async insert(db: Db, o: OrderProps): Promise<void> {
    try {
      await db.order.create({
        data: {
          id: o.id,
          number: o.number,
          ...headerColumns(o),
          correlationId: o.correlationId,
          createdAt: o.createdAt,
          version: 1,
          lines: {
            create: o.lines.map((line, position) => ({
              position,
              sku: line.sku,
              slug: line.slug,
              productName: line.productName,
              variantLabel: line.variantLabel,
              qty: line.qty,
              unitPriceCents: line.unitPriceCents,
              lineTotalCents: line.lineTotalCents,
            })),
          },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, "number")) throw new DuplicateOrderNumberError(o.number);
      if (isUniqueViolation(error)) throw new ConcurrencyConflictError("Order", o.id);
      throw error;
    }
  }
}

function headerColumns(o: OrderProps) {
  return {
    status: o.status,
    userId: o.customer.userId,
    customerEmail: o.customer.email,
    customerName: o.customer.name,
    shippingAddress: o.shippingAddress as unknown as Prisma.InputJsonValue,
    shippingMethod: o.shippingMethod,
    subtotalCents: o.pricing.subtotalCents,
    discountCents: o.pricing.discountCents,
    shippingCents: o.pricing.shippingCents,
    taxCents: o.pricing.taxCents,
    taxRatePercent: o.pricing.taxRatePercent,
    totalCents: o.pricing.totalCents,
    currency: o.pricing.currency,
    couponCode: o.couponCode,
    refundedCents: o.refundedCents,
    cancellationReason: o.cancellationReason,
    cancelledAt: o.cancelledAt,
    paymentId: o.payment.paymentId,
    transactionId: o.payment.transactionId,
    paidAt: o.paidAt,
    paymentDeadline: o.paymentDeadline,
    carrier: o.fulfillment.carrier,
    trackingNumber: o.fulfillment.trackingNumber,
    trackingUrl: o.fulfillment.trackingUrl,
    shippedAt: o.fulfillment.shippedAt,
    deliveredAt: o.fulfillment.deliveredAt,
    invoiceNumber: o.invoice?.number ?? null,
    invoiceIssuedAt: o.invoice?.issuedAt ?? null,
  };
}

function toDomain(row: OrderRow): Order {
  return Order.restore({
    id: row.id,
    number: row.number,
    status: row.status as OrderStatus,
    customer: { userId: row.userId, email: row.customerEmail, name: row.customerName },
    shippingAddress: row.shippingAddress as unknown as PostalAddress,
    shippingMethod: row.shippingMethod as ShippingMethodId,
    lines: row.lines.map((line) => ({
      sku: line.sku,
      slug: line.slug,
      productName: line.productName,
      variantLabel: line.variantLabel,
      qty: line.qty,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
    })),
    pricing: {
      subtotalCents: row.subtotalCents,
      discountCents: row.discountCents,
      shippingCents: row.shippingCents,
      taxCents: row.taxCents,
      taxRatePercent: row.taxRatePercent,
      totalCents: row.totalCents,
      currency: "EUR",
    },
    couponCode: row.couponCode,
    refundedCents: row.refundedCents,
    cancellationReason: row.cancellationReason as CancellationReason | null,
    cancelledAt: row.cancelledAt,
    payment: { paymentId: row.paymentId, transactionId: row.transactionId },
    paidAt: row.paidAt,
    paymentDeadline: row.paymentDeadline,
    fulfillment: { carrier: row.carrier, trackingNumber: row.trackingNumber, trackingUrl: row.trackingUrl, shippedAt: row.shippedAt, deliveredAt: row.deliveredAt },
    invoice: row.invoiceNumber && row.invoiceIssuedAt ? { number: row.invoiceNumber, issuedAt: row.invoiceIssuedAt } : null,
    refunds: row.refunds.map((refund) => ({
      id: refund.id,
      amountCents: refund.amountCents,
      reason: refund.reason,
      status: refund.status as RefundStatus,
      returnId: refund.returnId,
      failureReason: refund.failureReason,
      createdAt: refund.createdAt,
      settledAt: refund.settledAt,
    })),
    returns: row.returns.map((ret) => ({
      id: ret.id,
      status: ret.status as ReturnStatus,
      lines: ret.lines as unknown as SkuQty[],
      reason: ret.reason,
      refundCents: ret.refundCents,
      restock: ret.restock,
      note: ret.note,
      createdAt: ret.createdAt,
      decidedAt: ret.decidedAt,
    })),
    timeline: row.timeline.map((entry) => ({ id: entry.id, status: entry.status as TimelineStatus, note: entry.note, at: entry.at })),
    correlationId: row.correlationId,
    createdAt: row.createdAt,
    version: row.version,
  });
}
