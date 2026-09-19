import type { CurrencyCode, PaymentProviderId, PaymentStatus } from "@meridian/contracts";
import { Payment, type RefundKind, type RefundState, type RefundStatus } from "../../domain";
import type { Payment as PaymentRow, Refund as RefundRow } from "../../generated/prisma";

export function toRefundState(row: RefundRow): RefundState {
  return {
    refundId: row.refundId,
    kind: row.kind as RefundKind,
    amountCents: row.amountCents,
    reason: row.reason,
    status: row.status as RefundStatus,
    providerRefundId: row.providerRefundId,
    failureReason: row.failureReason,
    dispatchLeaseUntil: row.dispatchLeaseUntil,
    createdAt: row.createdAt,
    settledAt: row.settledAt,
  };
}

export function toPayment(row: PaymentRow & { refunds: RefundRow[] }): Payment {
  return Payment.restore({
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    transactionId: row.transactionId,
    provider: row.provider as PaymentProviderId,
    status: row.status as PaymentStatus,
    amountCents: row.amountCents,
    currency: row.currency as CurrencyCode,
    clientSecretHash: row.clientSecretHash,
    providerTransactionId: row.providerTransactionId,
    failureReason: row.failureReason,
    voidReason: row.voidReason,
    succeededAt: row.succeededAt,
    voidedAt: row.voidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    refunds: [...row.refunds].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(toRefundState),
  });
}
