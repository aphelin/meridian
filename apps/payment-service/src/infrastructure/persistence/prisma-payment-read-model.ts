import type { PaymentProviderId, PaymentStatus, PaymentSummaryDto } from "@meridian/contracts";
import { Injectable } from "@nestjs/common";
import { PaymentReadModel } from "../../application/ports";
import { PrismaService } from "../prisma.service";

@Injectable()
export class PrismaPaymentReadModel extends PaymentReadModel {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async summaryByOrder(orderId: string): Promise<PaymentSummaryDto | null> {
    const row = await this.prisma.payment.findUnique({ where: { orderId }, include: { refunds: { orderBy: { createdAt: "asc" } } } });
    if (!row) return null;
    return {
      paymentId: row.id,
      transactionId: row.transactionId,
      provider: row.provider as PaymentProviderId,
      status: row.status as PaymentStatus,
      amountCents: row.amountCents,
      refundedCents: row.refunds.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amountCents, 0),
      createdAt: row.createdAt.toISOString(),
      refunds: row.refunds.map((r) => ({
        refundId: r.refundId,
        amountCents: r.amountCents,
        status: r.status as "pending" | "succeeded" | "failed",
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
