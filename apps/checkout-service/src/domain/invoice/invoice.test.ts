import type { PricingBreakdown } from "@meridian/contracts";
import { describe, expect, it } from "vitest";
import { Order } from "../order/order";
import { Invoice } from "./invoice";
import { invoiceDocumentFor } from "./invoice-document";
import { InvoiceNumber } from "./invoice-number";

const t0 = new Date("2026-09-17T10:00:00Z");
const pricing: PricingBreakdown = { subtotalCents: 54_000, discountCents: 0, shippingCents: 4900, taxCents: 9404, taxRatePercent: 19, totalCents: 58_900, currency: "EUR" };

function order(paid = true) {
  const o = Order.place({
    id: "order-1",
    number: "M-ABCDEFGH",
    customer: { userId: null, email: "guest@example.test", name: "Guest" },
    shippingAddress: { fullName: "Guest", line1: "1 Road", line2: "Floor 2", city: "Berlin", postalCode: "10115", country: "DE", phone: null },
    shippingMethod: "standard",
    lines: [{ sku: "KITE-OCH", slug: "kite-lamp", productName: "Kite", variantLabel: "Ochre linen", qty: 1, unitPriceCents: 54_000, lineTotalCents: 54_000 }],
    pricing,
    couponCode: null,
    correlationId: "c",
    holdMinutes: 15,
    now: t0,
  });
  if (paid) o.markPaid({ paymentId: "p", transactionId: "t", amountCents: 58_900 }, t0);
  return o;
}

describe("InvoiceNumber", () => {
  it("invoice number is INV-YYYY- plus the sequence zero-padded to six digits", () => {
    expect(InvoiceNumber.from(2026, 123).value).toBe("INV-2026-000123");
    expect(InvoiceNumber.from(2026, 1_234_567).value).toBe("INV-2026-1234567");
    expect(InvoiceNumber.parse("INV-2027-000042")).toMatchObject({ year: 2027, sequence: 42 });
  });

  it("invoice number rejects invalid sequences and formats", () => {
    expect(() => InvoiceNumber.from(2026, 0)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => InvoiceNumber.parse("INV-26-1")).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });
});

describe("Invoice aggregate", () => {
  it("allocates an invoice number and object key from the sequence and issue year", () => {
    const invoice = Invoice.allocate({ id: "i1", orderId: "order-1", sequence: 7, totalCents: 58_900, now: t0 });
    expect(invoice.snapshot()).toMatchObject({ number: "INV-2026-000007", sequence: 7, status: "allocated", objectKey: "invoices/2026/INV-2026-000007.pdf", issuedAt: null });
  });

  it("invoice is issued once", () => {
    const invoice = Invoice.allocate({ id: "i1", orderId: "order-1", sequence: 1, totalCents: 1, now: t0 });
    expect(invoice.markIssued(t0)).toBe(true);
    expect(invoice.markIssued(new Date(t0.getTime() + 1000))).toBe(false);
    expect(invoice.snapshot().issuedAt).toEqual(t0);
  });
});

describe("Invoice document", () => {
  it("invoice document carries lines, pricing, VAT contained in the total and the net amount", () => {
    const doc = invoiceDocumentFor(order().snapshot(), "INV-2026-000001", t0, "Standard delivery");
    expect(doc).toMatchObject({
      invoiceNumber: "INV-2026-000001",
      orderNumber: "M-ABCDEFGH",
      lines: [{ sku: "KITE-OCH", description: "Kite — Ochre linen", qty: 1, unitPriceCents: 54_000, lineTotalCents: 54_000 }],
      pricing: { totalCents: 58_900, taxCents: 9404, taxRatePercent: 19 },
      netCents: 58_900 - 9404,
      shippingMethodLabel: "Standard delivery",
      billingAddress: { city: "Berlin", line2: "Floor 2" },
    });
  });

  it("invoice document for an unpaid order is refused", () => {
    expect(() => invoiceDocumentFor(order(false).snapshot(), "INV-2026-000001", t0, "Standard")).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
  });
});
