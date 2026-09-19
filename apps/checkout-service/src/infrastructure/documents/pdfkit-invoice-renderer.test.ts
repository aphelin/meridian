import { describe, expect, it } from "vitest";
import { type InvoiceDocument, SELLER } from "../../domain";
import { PdfKitInvoiceRenderer } from "./pdfkit-invoice-renderer";

const address = { fullName: "Ops Buyer", line1: "1 Probe Road", line2: null, city: "Berlin", postalCode: "10115", country: "DE", phone: null };
const document: InvoiceDocument = {
  invoiceNumber: "INV-2026-000042",
  issuedAt: new Date("2026-09-17T10:00:00Z"),
  orderNumber: "M-ABCDEFGH",
  orderDate: new Date("2026-09-17T09:00:00Z"),
  paidAt: new Date("2026-09-17T09:05:00Z"),
  customer: { userId: null, email: "buyer@example.test", name: "Ops Buyer" },
  billingAddress: address,
  shippingAddress: address,
  shippingMethodLabel: "Standard delivery",
  lines: Array.from({ length: 30 }, (_, i) => ({ sku: `SKU-${i}`, description: `Item ${i} — Oak`, qty: 1, unitPriceCents: 1000, lineTotalCents: 1000 })),
  pricing: { subtotalCents: 30_000, discountCents: 3000, shippingCents: 4900, taxCents: 5094, taxRatePercent: 19, totalCents: 31_900, currency: "EUR" },
  netCents: 26_806,
  couponCode: "NORTH-10",
  seller: SELLER,
};

describe("PdfKitInvoiceRenderer", () => {
  it("renders an invoice PDF (multi-page for long orders) with the invoice number in its metadata", async () => {
    const bytes = Buffer.from(await new PdfKitInvoiceRenderer().render(document));
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1500);
    expect(bytes.includes(Buffer.from("INV-2026-000042"))).toBe(true);
    expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
