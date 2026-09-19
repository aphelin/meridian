import type { EmailTemplate, EventPayloads } from "@meridian/contracts";
import { dedupeKeyOf } from "../delivery/email-delivery";
import type { OrderRecipient } from "./order-recipient";

/** A request to send one templated email; becomes a `notification.send-email` command. */
export interface EmailRequest {
  template: EmailTemplate;
  to: { email: string; name: string | null };
  data: Record<string, unknown>;
  /** Stable business identity of the email: redelivered events never mail twice. */
  dedupeKey: string;
}

/** Builds shopper-facing links. Guest order links carry the order access token (never sent over Kafka). */
export interface OrderLinks {
  orderUrl(orderId: string, customer: { userId: string | null }): string;
  productUrl(slug: string): string;
  reviewUrl(slug: string): string;
}

export type OrderEmailEventName =
  | "OrderPaid"
  | "OrderShipped"
  | "OrderDelivered"
  | "OrderCancelled"
  | "OrderRefunded"
  | "ReturnRequested"
  | "ReturnApproved"
  | "ReturnRejected"
  | "InvoiceIssued";

export const ORDER_EMAIL_EVENTS: readonly OrderEmailEventName[] = [
  "OrderPaid",
  "OrderShipped",
  "OrderDelivered",
  "OrderCancelled",
  "OrderRefunded",
  "ReturnRequested",
  "ReturnApproved",
  "ReturnRejected",
  "InvoiceIssued",
];

export type OrderEmailEvent = { [N in OrderEmailEventName]: { name: N; payload: EventPayloads[N] } }[OrderEmailEventName];

/**
 * Domain service: which customer email an order lifecycle event produces, with which template data.
 * Dedupe keys are derived from the business fact (order, refund, return), not from the Kafka message, so a
 * republished or replayed event cannot mail the customer twice.
 */
export function planOrderEmail(event: OrderEmailEvent, links: OrderLinks, stored: OrderRecipient | null): EmailRequest {
  const p = event.payload;
  const to = { email: p.customer.email, name: p.customer.name || null };
  const orderUrl = links.orderUrl(p.orderId, p.customer);
  const request = (template: EmailTemplate, keyParts: string[], data: Record<string, unknown>): EmailRequest => ({ template, to, data: { number: p.number, orderUrl, ...data }, dedupeKey: dedupeKeyOf(template, ...keyParts) });

  switch (event.name) {
    case "OrderPaid":
      return request("order-confirmation", [p.orderId], {
        lines: event.payload.lines,
        pricing: event.payload.pricing,
        shippingAddress: stored?.shippingAddress ?? null,
      });
    case "OrderShipped":
      return request("order-shipped", [p.orderId, event.payload.trackingNumber], {
        carrier: event.payload.carrier,
        trackingNumber: event.payload.trackingNumber,
        trackingUrl: event.payload.trackingUrl,
      });
    case "OrderDelivered": {
      const seen = new Set<string>();
      const reviewUrls = event.payload.lines
        .filter((line) => (seen.has(line.slug) ? false : (seen.add(line.slug), true)))
        .map((line) => ({ productName: line.productName, url: links.reviewUrl(line.slug) }));
      return request("order-delivered", [p.orderId], { reviewUrls });
    }
    case "OrderCancelled":
      return request("order-cancelled", [p.orderId], { reason: event.payload.reason, refundRequired: event.payload.refundRequired });
    case "OrderRefunded":
      return request("order-refunded", [event.payload.refundId], { amountCents: event.payload.amountCents, full: event.payload.full });
    case "ReturnRequested":
      return request("return-received", [event.payload.returnId], {});
    case "ReturnApproved":
      return request("return-approved", [event.payload.returnId], { refundCents: event.payload.refundCents });
    case "ReturnRejected":
      return request("return-rejected", [event.payload.returnId], { note: event.payload.note });
    case "InvoiceIssued":
      return request("invoice-issued", [p.orderId, event.payload.invoiceNumber], { invoiceNumber: event.payload.invoiceNumber });
  }
}

/** Human product name from a catalog slug when only the slug is known ("holt-sofa" → "Holt sofa"). */
export function productNameFromSlug(slug: string): string {
  const words = slug.split("-").filter(Boolean);
  if (!words.length) return slug;
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
