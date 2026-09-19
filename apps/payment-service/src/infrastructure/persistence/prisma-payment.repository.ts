import { type Payment, PaymentRepository, type PaymentLookup } from "../../domain";
import type { Prisma } from "../../generated/prisma";
import { toPayment } from "./payment-mapper";

/** Transaction-bound Payment repository using row locks (SELECT … FOR UPDATE). */
export class PrismaPaymentRepository extends PaymentRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {
    super();
  }

  async lock(lookup: PaymentLookup): Promise<Payment | null> {
    const id = await this.lockedId(lookup);
    if (!id) return null;
    const row = await this.tx.payment.findUnique({ where: { id }, include: { refunds: true } });
    return row ? toPayment(row) : null;
  }

  async insert(payment: Payment): Promise<void> {
    const { refunds, ...state } = payment.snapshot();
    await this.tx.payment.create({ data: state });
    for (const refund of refunds) await this.tx.refund.create({ data: { ...refund, paymentId: state.id } });
  }

  async save(payment: Payment): Promise<void> {
    const { refunds, id, orderId, transactionId, provider, amountCents, currency, createdAt, ...mutable } = payment.snapshot();
    await this.tx.payment.update({ where: { id }, data: mutable });
    for (const refund of refunds) {
      const { refundId, ...rest } = refund;
      await this.tx.refund.upsert({
        where: { paymentId_refundId: { paymentId: id, refundId } },
        create: { paymentId: id, refundId, ...rest },
        update: {
          status: rest.status,
          providerRefundId: rest.providerRefundId,
          failureReason: rest.failureReason,
          dispatchLeaseUntil: rest.dispatchLeaseUntil,
          settledAt: rest.settledAt,
        },
      });
    }
  }

  private async lockedId(lookup: PaymentLookup): Promise<string | null> {
    let rows: { id: string }[];
    if ("orderId" in lookup) {
      // Order-scoped advisory lock first: serialises intent creation for an order that has no row to lock yet.
      await this.tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`payment-order:${lookup.orderId}`}, 0))`;
      rows = await this.tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "orderId" = ${lookup.orderId} FOR UPDATE`;
    } else if ("id" in lookup) {
      rows = await this.tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${lookup.id} FOR UPDATE`;
    } else if ("transactionId" in lookup) {
      rows = await this.tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "transactionId" = ${lookup.transactionId} FOR UPDATE`;
    } else if ("providerTransactionId" in lookup) {
      rows = await this.tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "providerTransactionId" = ${lookup.providerTransactionId} FOR UPDATE`;
    } else {
      rows = await this.tx.$queryRaw`
        SELECT p."id" FROM "Payment" p JOIN "Refund" r ON r."paymentId" = p."id"
        WHERE r."providerRefundId" = ${lookup.providerRefundId} FOR UPDATE OF p`;
    }
    return rows[0]?.id ?? null;
  }
}
