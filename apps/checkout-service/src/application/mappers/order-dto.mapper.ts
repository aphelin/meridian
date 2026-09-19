import type { AdminOrderDto, OrderDto, PaymentSummaryDto, RefundDto, ReturnDto } from "@meridian/contracts";
import type { AuditEntry, Order, Refund, ReturnRequest, ShippingPolicies } from "../../domain";

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** OrderDto for a viewer at `now` (actions depend on time: payment deadline, return window). */
export function toOrderDto(order: Order, shipping: ShippingPolicies, now: Date): OrderDto {
  const o = order.snapshot();
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    customer: o.customer,
    shippingAddress: o.shippingAddress,
    shippingMethod: { id: o.shippingMethod, label: shipping.has(o.shippingMethod) ? shipping.get(o.shippingMethod).label : o.shippingMethod },
    lines: o.lines,
    pricing: o.pricing,
    couponCode: o.couponCode,
    refundedCents: o.refundedCents,
    cancellationReason: o.cancellationReason,
    fulfillment: {
      carrier: o.fulfillment.carrier,
      trackingNumber: o.fulfillment.trackingNumber,
      trackingUrl: o.fulfillment.trackingUrl,
      shippedAt: iso(o.fulfillment.shippedAt),
      deliveredAt: iso(o.fulfillment.deliveredAt),
    },
    invoice: o.invoice ? { number: o.invoice.number, issuedAt: o.invoice.issuedAt.toISOString() } : null,
    returns: o.returns.map((ret) => toReturnDto(o.id, ret)),
    refunds: o.refunds.map(toRefundDto),
    timeline: [...o.timeline].sort((a, b) => a.at.getTime() - b.at.getTime()).map((entry) => ({ status: entry.status, at: entry.at.toISOString(), note: entry.note })),
    actions: order.actionsAt(now),
    paymentDeadline: iso(o.paymentDeadline),
    createdAt: o.createdAt.toISOString(),
    correlationId: o.correlationId,
  };
}

export function toReturnDto(orderId: string, ret: ReturnRequest): ReturnDto {
  return {
    id: ret.id,
    orderId,
    status: ret.status,
    lines: ret.lines,
    reason: ret.reason,
    refundCents: ret.refundCents,
    note: ret.note,
    createdAt: ret.createdAt.toISOString(),
    decidedAt: iso(ret.decidedAt),
  };
}

export function toRefundDto(refund: Refund): RefundDto {
  return { id: refund.id, amountCents: refund.amountCents, reason: refund.reason, status: refund.status, createdAt: refund.createdAt.toISOString() };
}

/** Admin view: the order plus the payment-service summary (null when unavailable) and the order's audit trail. */
export function toAdminOrderDto(order: Order, shipping: ShippingPolicies, now: Date, payment: PaymentSummaryDto | null, audit: AuditEntry[]): AdminOrderDto {
  return {
    ...toOrderDto(order, shipping, now),
    payment,
    audit: [...audit].sort((a, b) => a.at.getTime() - b.at.getTime()).map((entry) => ({ action: entry.action, actorId: entry.actorId, at: entry.at.toISOString(), meta: entry.meta })),
  };
}
