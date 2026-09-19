import { describe, expect, it } from "vitest";
import { TemplateDataError } from "../../application/ports";
import { EMAIL_TEMPLATES } from "../../domain";
import { TemplateEmailRenderer } from "./template-renderer";

const renderer = new TemplateEmailRenderer({ publicSiteUrl: "http://localhost:3100", supportEmail: "support@meridian.local", sendLeaseMs: 45_000 });
const site = "http://localhost:3100";
const lines = [{ sku: "HOLT-CHA-3", slug: "holt-sofa", productName: "Holt", variantLabel: "Charcoal wool", qty: 1, unitPriceCents: 240000, lineTotalCents: 240000 }];
const pricing = { subtotalCents: 240000, discountCents: 24000, shippingCents: 0, taxCents: 36000, taxRatePercent: 20, totalCents: 216000, currency: "EUR" };
const orderUrl = `${site}/orders/o1`;

const samples: Record<(typeof EMAIL_TEMPLATES)[number], Record<string, unknown>> = {
  "verify-email": { name: "Ada", verifyUrl: `${site}/account/verify-email?token=t1` },
  "password-reset": { name: "Ada", resetUrl: `${site}/account/reset-password?token=t2` },
  "password-changed": { name: "Ada" },
  "account-deleted": { name: "Ada" },
  "order-confirmation": { number: "M-1", lines, pricing, shippingAddress: null, orderUrl },
  "order-shipped": { number: "M-1", carrier: "DHL", trackingNumber: "TRK123", trackingUrl: "https://carrier.test/TRK123", orderUrl },
  "order-delivered": { number: "M-1", orderUrl, reviewUrls: [{ productName: "Holt", url: `${site}/product/holt-sofa#reviews` }] },
  "order-cancelled": { number: "M-1", reason: "customer", refundRequired: true, orderUrl },
  "order-refunded": { number: "M-1", amountCents: 50000, full: false, orderUrl },
  "return-received": { number: "M-1", orderUrl },
  "return-approved": { number: "M-1", refundCents: 50000, orderUrl },
  "return-rejected": { number: "M-1", note: "Outside the window", orderUrl },
  "invoice-issued": { number: "M-1", invoiceNumber: "INV-2026-000001", orderUrl },
  "newsletter-confirm": { confirmUrl: `${site}/newsletter/confirm?token=t3` },
  "newsletter-welcome": { unsubscribeUrl: `${site}/newsletter/unsubscribe?token=t4` },
  "contact-received": { name: "Ada" },
  "contact-internal": { name: "Ada", email: "ada@example.com", topic: "order", orderNumber: "M-1", message: "Hello <script>alert(1)</script>" },
  "back-in-stock": { productName: "Holt", productUrl: `${site}/product/holt-sofa` },
};

const to = { email: "ada@example.com", name: "Ada" };

describe("email templates", () => {
  it("every template renders HTML and text with the sandbox subject prefix and distinct subjects", () => {
    const subjects = EMAIL_TEMPLATES.map((template) => {
      const email = renderer.render(template, samples[template], to);
      expect(email.subject.startsWith("[Meridian sandbox] ")).toBe(true);
      expect(email.html).toContain("MERIDIAN");
      expect(email.text.length).toBeGreaterThan(20);
      return email.subject;
    });
    expect(new Set(subjects).size).toBe(EMAIL_TEMPLATES.length);
  });

  it("order confirmation template shows the number and the formatted total", () => {
    const email = renderer.render("order-confirmation", samples["order-confirmation"], to);
    expect(email.subject).toContain("M-1");
    expect(email.text).toContain("€2,160.00");
    expect(email.text).toContain("−€240.00");
  });

  it("template escapes user content in HTML and sets reply-to for contact-internal", () => {
    const email = renderer.render("contact-internal", samples["contact-internal"], to);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.replyTo).toBe("ada@example.com");
  });

  it("template data is validated: missing keys and off-site action links are rejected", () => {
    expect(() => renderer.render("password-reset", { name: "Ada" }, to)).toThrow(TemplateDataError);
    expect(() => renderer.render("password-reset", { name: "Ada", resetUrl: "https://evil.test/reset" }, to)).toThrow(TemplateDataError);
    expect(() => renderer.render("order-shipped", { ...samples["order-shipped"], trackingUrl: "javascript:alert(1)" }, to)).toThrow(TemplateDataError);
  });

  it("template subjects stay on one line even with hostile names", () => {
    const email = renderer.render("contact-internal", { ...samples["contact-internal"], name: "Eve\r\nBcc: victim@example.com" }, to);
    expect(email.subject).not.toMatch(/[\r\n]/);
  });
});
