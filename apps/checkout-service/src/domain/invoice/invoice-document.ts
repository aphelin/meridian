import type { CustomerRef, OrderLineSnapshot, PostalAddress, PricingBreakdown } from "@meridian/contracts";
import { ensure } from "@meridian/kernel";
import type { OrderProps } from "../order/order";

export interface InvoiceDocumentLine {
  sku: string;
  description: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

/** Seller block printed on every invoice. */
export const SELLER = {
  name: "Meridian Home GmbH",
  address: ["Torstraße 1", "10119 Berlin", "Germany"],
  vatId: "DE000000000",
  email: "orders@meridian.local",
} as const;

/**
 * Everything printed on an invoice, derived from the order at issue time. Prices are VAT inclusive; `netCents` is
 * total − VAT and the VAT is the amount contained in the total at the destination rate.
 */
export interface InvoiceDocument {
  invoiceNumber: string;
  issuedAt: Date;
  orderNumber: string;
  orderDate: Date;
  paidAt: Date | null;
  customer: CustomerRef;
  billingAddress: PostalAddress;
  shippingAddress: PostalAddress;
  shippingMethodLabel: string;
  lines: InvoiceDocumentLine[];
  pricing: PricingBreakdown;
  netCents: number;
  couponCode: string | null;
  seller: typeof SELLER;
}

export function invoiceDocumentFor(order: OrderProps, invoiceNumber: string, issuedAt: Date, shippingMethodLabel: string): InvoiceDocument {
  ensure(order.paidAt !== null, "INVALID_TRANSITION", "Invoices are issued for paid orders only.");
  const lines = order.lines.map((line: OrderLineSnapshot) => ({
    sku: line.sku,
    description: `${line.productName} — ${line.variantLabel}`,
    qty: line.qty,
    unitPriceCents: line.unitPriceCents,
    lineTotalCents: line.lineTotalCents,
  }));
  const pricing = structuredClone(order.pricing);
  return {
    invoiceNumber,
    issuedAt,
    orderNumber: order.number,
    orderDate: order.createdAt,
    paidAt: order.paidAt,
    customer: structuredClone(order.customer),
    // Orders capture one address; it is both the delivery and the billing address.
    billingAddress: structuredClone(order.shippingAddress),
    shippingAddress: structuredClone(order.shippingAddress),
    shippingMethodLabel,
    lines,
    pricing,
    netCents: pricing.totalCents - pricing.taxCents,
    couponCode: order.couponCode,
    seller: SELLER,
  };
}
