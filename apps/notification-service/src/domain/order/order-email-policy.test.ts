import type { EventPayloads } from "@meridian/contracts";
import { describe, expect, it } from "vitest";
import { ContactMessage } from "../contact/contact-message";
import { EmailAddress } from "../shared/email-address";
import { StockAlert } from "../stock-alert/stock-alert";
import { planOrderEmail, productNameFromSlug, type OrderLinks } from "./order-email-policy";

const links: OrderLinks = {
  orderUrl: (id, c) => `http://site.test/orders/${id}${c.userId ? "" : "?access=tok"}`,
  productUrl: (slug) => `http://site.test/product/${slug}`,
  reviewUrl: (slug) => `http://site.test/product/${slug}#reviews`,
};
const header = { orderId: "ord_1", number: "M-ABCDEFGH", customer: { userId: null, email: "guest@example.com", name: "Guest" } };
const pricing = { subtotalCents: 1000, discountCents: 0, shippingCents: 0, taxCents: 167, taxRatePercent: 20, totalCents: 1000, currency: "EUR" as const };
const address = { fullName: "Guest", line1: "1 Road", line2: null, city: "Tbilisi", postalCode: "0105", country: "GE", phone: null };

describe("order email policy (dispatch)", () => {
  it("OrderPaid dispatches an order confirmation with the stored shipping address and guest access link", () => {
    const payload: EventPayloads["OrderPaid"] = { ...header, lines: [], pricing, paymentId: "pay_1", paidAt: "2026-09-17T10:00:00Z" };
    const request = planOrderEmail({ name: "OrderPaid", payload }, links, { orderId: "ord_1", number: header.number, customer: header.customer, shippingAddress: address });
    expect(request).toMatchObject({ template: "order-confirmation", dedupeKey: "order-confirmation:ord_1", to: { email: "guest@example.com" } });
    expect(request.data).toMatchObject({ number: "M-ABCDEFGH", orderUrl: "http://site.test/orders/ord_1?access=tok", shippingAddress: address, pricing });
  });

  it("signed-in customers get order links without an access token", () => {
    const payload: EventPayloads["OrderShipped"] = { ...header, customer: { ...header.customer, userId: "usr_1" }, carrier: "DHL", trackingNumber: "T1", trackingUrl: "https://t.test/T1", shippedAt: "x" };
    expect(planOrderEmail({ name: "OrderShipped", payload }, links, null).data.orderUrl).toBe("http://site.test/orders/ord_1");
  });

  it("dispatch dedupe keys follow the business fact, not the message", () => {
    const refund = (refundId: string): EventPayloads["OrderRefunded"] => ({ ...header, refundId, amountCents: 500, totalRefundedCents: 500, full: false, reason: "r" });
    expect(planOrderEmail({ name: "OrderRefunded", payload: refund("ref_1") }, links, null).dedupeKey).toBe("order-refunded:ref_1");
    expect(planOrderEmail({ name: "OrderRefunded", payload: refund("ref_2") }, links, null).dedupeKey).toBe("order-refunded:ref_2");
  });

  it("delivered orders link one review per product", () => {
    const lines = [
      { sku: "A-1", slug: "holt-sofa", productName: "Holt" },
      { sku: "A-2", slug: "holt-sofa", productName: "Holt" },
      { sku: "B-1", slug: "arc-lamp", productName: "Arc" },
    ];
    const request = planOrderEmail({ name: "OrderDelivered", payload: { ...header, lines, deliveredAt: "x" } }, links, null);
    expect(request.data.reviewUrls).toEqual([
      { productName: "Holt", url: "http://site.test/product/holt-sofa#reviews" },
      { productName: "Arc", url: "http://site.test/product/arc-lamp#reviews" },
    ]);
  });

  it("maps return and invoice events to their templates", () => {
    expect(planOrderEmail({ name: "ReturnRequested", payload: { ...header, returnId: "ret_1", lines: [], reason: "r" } }, links, null).template).toBe("return-received");
    expect(planOrderEmail({ name: "InvoiceIssued", payload: { ...header, invoiceNumber: "INV-2026-000001", totalCents: 1, issuedAt: "x" } }, links, null).data.invoiceNumber).toBe("INV-2026-000001");
  });

  it("derives a readable product name from a slug", () => {
    expect(productNameFromSlug("holt-sofa")).toBe("Holt sofa");
  });
});

describe("StockAlert and ContactMessage invariants", () => {
  const now = new Date("2026-09-17T10:00:00Z");

  it("stock alert has a pending key only while pending and notifies once", () => {
    const alert = StockAlert.create("alr_1", EmailAddress.parse("a@example.com"), "holt-cha-3", "holt-sofa", now);
    expect(alert.sku).toBe("HOLT-CHA-3");
    expect(alert.pendingKey).toBe("a@example.com|HOLT-CHA-3");
    alert.markNotified(now);
    expect(alert.pendingKey).toBeNull();
    expect(() => alert.markNotified(now)).toThrow(/already notified/);
  });

  it("stock alert rejects malformed slugs", () => {
    expect(() => StockAlert.create("alr_1", EmailAddress.parse("a@example.com"), "SKU-1", "../../etc", now)).toThrow(/slug/);
  });

  it("contact message trims, strips control characters and enforces lengths", () => {
    const msg = ContactMessage.receive({ id: "msg_1", name: "  Ada  Lovelace ", email: EmailAddress.parse("ada@example.com"), topic: "order", orderNumber: "m-abc", message: "Where is my sofa?\r\nThanks", correlationId: "c", now });
    expect(msg.snapshot()).toMatchObject({ name: "Ada Lovelace", orderNumber: "M-ABC", message: "Where is my sofa?\nThanks" });
    expect(() => ContactMessage.receive({ id: "m", name: "A", email: EmailAddress.parse("a@example.com"), topic: "order", message: "short", correlationId: "c", now })).toThrow(/Message/);
  });
});

describe("dispatch dedupe keys", () => {
  it("stay within the delivery limit for very long identifiers", () => {
    const payload: EventPayloads["OrderShipped"] = { ...header, orderId: "o".repeat(200), carrier: "DHL", trackingNumber: "1Z 999 AA1 01 2345 6784", trackingUrl: "https://t.test", shippedAt: "x" };
    const key = planOrderEmail({ name: "OrderShipped", payload }, links, null).dedupeKey;
    expect(key.length).toBeLessThanOrEqual(200);
    expect(key.startsWith("order-shipped:sha256:")).toBe(true);
  });
});
