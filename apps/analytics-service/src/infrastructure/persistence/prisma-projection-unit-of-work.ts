import { Inbox } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import type { ProjectionTransaction } from "../../application/ports";
import { ProjectionUnitOfWork } from "../../application/ports";
import { OrderActivity, type ProjectionDelta } from "../../domain";
import type { Prisma } from "../../generated/prisma";
import { PrismaService } from "../prisma.service";

interface OrderActivityRow {
  orderId: string;
  placedDay: string | null;
  paidDay: string | null;
  cancelledDay: string | null;
  paidCents: bigint;
  refundedCents: bigint;
  paymentFailures: number;
}

const TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

/**
 * READ COMMITTED transactions with explicit locking. Lock order in every projection: the order's activity row, then
 * DailySales by day, ProductSales by (day, sku), CancellationStats by (day, reason), then ProjectionState, so
 * concurrent partitions and replicas never deadlock.
 */
@Injectable()
export class PrismaProjectionUnitOfWork extends ProjectionUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  once(consumer: string, messageId: string, work: (tx: ProjectionTransaction) => Promise<void>): Promise<boolean> {
    return this.prisma.$transaction((tx) => Inbox.once(tx, consumer, messageId, () => work(bind(tx, consumer))), TX_OPTIONS);
  }

  async truncate(consumer: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`TRUNCATE TABLE "DailySales", "ProductSales", "CancellationStats", "OrderActivity", "ProjectionState"`;
      await tx.$executeRaw`DELETE FROM "Inbox" WHERE "consumer" = ${consumer}`;
    }, TX_OPTIONS);
  }
}

function bind(tx: Prisma.TransactionClient, projector: string): ProjectionTransaction {
  return {
    async lockOrder(orderId) {
      await tx.$executeRaw`INSERT INTO "OrderActivity" ("orderId", "updatedAt") VALUES (${orderId}, CURRENT_TIMESTAMP) ON CONFLICT ("orderId") DO NOTHING`;
      const rows = await tx.$queryRaw<OrderActivityRow[]>`
        SELECT "orderId", "placedDay", "paidDay", "cancelledDay", "paidCents", "refundedCents", "paymentFailures"
        FROM "OrderActivity" WHERE "orderId" = ${orderId} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new Error(`OrderActivity ${orderId} vanished while locking`);
      return OrderActivity.restore({ ...row, paidCents: Number(row.paidCents), refundedCents: Number(row.refundedCents) });
    },

    async saveOrder(activity) {
      const s = activity.snapshot();
      await tx.orderActivity.update({
        where: { orderId: s.orderId },
        data: {
          placedDay: s.placedDay,
          paidDay: s.paidDay,
          cancelledDay: s.cancelledDay,
          paidCents: BigInt(s.paidCents),
          refundedCents: BigInt(s.refundedCents),
          paymentFailures: s.paymentFailures,
          updatedAt: new Date(),
        },
      });
    },

    async applyDelta(delta: ProjectionDelta) {
      for (const d of delta.daily()) {
        await tx.$executeRaw`
          INSERT INTO "DailySales" ("day", "ordersPlaced", "ordersPaid", "ordersCancelled", "paymentsFailed", "placedCents", "grossCents", "refundsCents", "updatedAt")
          VALUES (${d.day}, ${d.ordersPlaced}, ${d.ordersPaid}, ${d.ordersCancelled}, ${d.paymentsFailed}, ${BigInt(d.placedCents)}, ${BigInt(d.grossCents)}, ${BigInt(d.refundsCents)}, CURRENT_TIMESTAMP)
          ON CONFLICT ("day") DO UPDATE SET
            "ordersPlaced" = "DailySales"."ordersPlaced" + EXCLUDED."ordersPlaced",
            "ordersPaid" = "DailySales"."ordersPaid" + EXCLUDED."ordersPaid",
            "ordersCancelled" = "DailySales"."ordersCancelled" + EXCLUDED."ordersCancelled",
            "paymentsFailed" = "DailySales"."paymentsFailed" + EXCLUDED."paymentsFailed",
            "placedCents" = "DailySales"."placedCents" + EXCLUDED."placedCents",
            "grossCents" = "DailySales"."grossCents" + EXCLUDED."grossCents",
            "refundsCents" = "DailySales"."refundsCents" + EXCLUDED."refundsCents",
            "updatedAt" = CURRENT_TIMESTAMP`;
      }
      for (const p of delta.products()) {
        await tx.$executeRaw`
          INSERT INTO "ProductSales" ("day", "sku", "slug", "productName", "units", "revenueCents", "updatedAt")
          VALUES (${p.day}, ${p.sku}, ${p.slug}, ${p.productName}, ${p.units}, ${BigInt(p.revenueCents)}, CURRENT_TIMESTAMP)
          ON CONFLICT ("day", "sku") DO UPDATE SET
            "units" = "ProductSales"."units" + EXCLUDED."units",
            "revenueCents" = "ProductSales"."revenueCents" + EXCLUDED."revenueCents",
            "slug" = EXCLUDED."slug",
            "productName" = EXCLUDED."productName",
            "updatedAt" = CURRENT_TIMESTAMP`;
      }
      for (const c of delta.cancellations()) {
        await tx.$executeRaw`
          INSERT INTO "CancellationStats" ("day", "reason", "count") VALUES (${c.day}, ${c.reason}, 1)
          ON CONFLICT ("day", "reason") DO UPDATE SET "count" = "CancellationStats"."count" + 1`;
      }
    },

    async recordEvent(occurredAt) {
      await tx.$executeRaw`
        INSERT INTO "ProjectionState" ("projector", "lastEventAt", "eventsProjected", "updatedAt")
        VALUES (${projector}, ${occurredAt}, 1, CURRENT_TIMESTAMP)
        ON CONFLICT ("projector") DO UPDATE SET
          "lastEventAt" = GREATEST("ProjectionState"."lastEventAt", EXCLUDED."lastEventAt"),
          "eventsProjected" = "ProjectionState"."eventsProjected" + 1,
          "updatedAt" = CURRENT_TIMESTAMP`;
    },
  };
}
