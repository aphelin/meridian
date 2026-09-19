import type { EmailTemplate } from "@meridian/contracts";
import { z } from "zod";
import type { Block, EmailContent } from "./blocks";
import { formatCents, greeting, subjectText } from "./format";

export const SANDBOX_SUBJECT_PREFIX = "[Meridian sandbox]";

export interface TemplateContext {
  /** Storefront origin, e.g. "http://localhost:3100". Action links must point at it. */
  siteOrigin: string;
  recipient: { email: string; name: string | null };
}

interface TemplateDefinition<S extends z.ZodType> {
  schema: (ctx: TemplateContext) => S;
  build: (data: z.output<S>, ctx: TemplateContext) => EmailContent & { replyTo?: string };
}

const define = <S extends z.ZodType>(definition: TemplateDefinition<S>) => definition as unknown as TemplateDefinition<z.ZodType>;

const httpUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "must be an http(s) URL");

/** Links a shopper acts on must lead to the storefront, never to an arbitrary host (no phishing through our mailer). */
const siteUrl = (ctx: TemplateContext) =>
  httpUrl.refine((value) => {
    try {
      return new URL(value).origin === ctx.siteOrigin;
    } catch {
      return false;
    }
  }, `must be a link to ${ctx.siteOrigin}`);

const name = z.string().max(200).nullish();
const number = z.string().min(1).max(40);
const cents = z.number().int();

const line = z.object({ productName: z.string().max(200), variantLabel: z.string().max(200), qty: z.number().int().min(1), lineTotalCents: cents });
const pricing = z.object({ subtotalCents: cents, discountCents: cents, shippingCents: cents, taxCents: cents, taxRatePercent: z.number().min(0).max(100), totalCents: cents });
const address = z.object({ fullName: z.string().max(200), line1: z.string().max(200), line2: z.string().max(200).nullish(), city: z.string().max(120), postalCode: z.string().max(20), country: z.string().max(2), phone: z.string().max(40).nullish() });

const CANCEL_REASONS: Record<string, string> = {
  customer: "you asked us to cancel it",
  admin: "our team had to cancel it",
  expired: "payment was not completed in time",
  "out-of-stock": "an item sold out before we could reserve it",
  "payment-unavailable": "payment could not be set up",
};

const TOPICS: Record<string, string> = { order: "An order", product: "A product", returns: "Returns", other: "Something else" };

const hello = (data: { name?: string | null }, ctx: TemplateContext): Block => ({ kind: "paragraph", text: greeting(data.name ?? ctx.recipient.name) });
const orderButton = (url: string): Block => ({ kind: "button", label: "View your order", url });

export const TEMPLATES: Record<EmailTemplate, TemplateDefinition<z.ZodType>> = {
  "verify-email": define({
    schema: (ctx) => z.object({ name, verifyUrl: siteUrl(ctx) }),
    build: (d, ctx) => ({
      subject: "Confirm your email address",
      preheader: "One click to finish setting up your Meridian account.",
      blocks: [
        { kind: "heading", text: "Confirm your email" },
        hello(d, ctx),
        { kind: "paragraph", text: "Please confirm this is your email address so we can keep you posted about your orders." },
        { kind: "button", label: "Confirm email", url: d.verifyUrl },
        { kind: "note", text: "The link is valid for 24 hours. If you did not create a Meridian account, you can ignore this email." },
      ],
    }),
  }),
  "password-reset": define({
    schema: (ctx) => z.object({ name, resetUrl: siteUrl(ctx) }),
    build: (d, ctx) => ({
      subject: "Reset your password",
      preheader: "Choose a new password for your Meridian account.",
      blocks: [
        { kind: "heading", text: "Reset your password" },
        hello(d, ctx),
        { kind: "paragraph", text: "We received a request to reset your password. Use the button below to choose a new one." },
        { kind: "button", label: "Choose a new password", url: d.resetUrl },
        { kind: "note", text: "The link is valid for one hour and can be used once. If you did not ask for this, your password stays unchanged." },
      ],
    }),
  }),
  "password-changed": define({
    schema: () => z.object({ name }),
    build: (d, ctx) => ({
      subject: "Your password was changed",
      preheader: "Your Meridian password was just changed.",
      blocks: [
        { kind: "heading", text: "Password changed" },
        hello(d, ctx),
        { kind: "paragraph", text: "The password for your Meridian account was just changed, and other sessions were signed out." },
        { kind: "note", text: "If this was not you, reset your password right away and contact our support team." },
      ],
    }),
  }),
  "account-deleted": define({
    schema: () => z.object({ name }),
    build: (d, ctx) => ({
      subject: "Your Meridian account has been deleted",
      preheader: "We have deleted your account and personal data.",
      blocks: [
        { kind: "heading", text: "Account deleted" },
        hello(d, ctx),
        { kind: "paragraph", text: "Your Meridian account, saved addresses and wishlist have been deleted. Past orders are kept anonymised for accounting." },
        { kind: "note", text: "We are sorry to see you go. You are welcome back any time." },
      ],
    }),
  }),
  "order-confirmation": define({
    schema: (ctx) => z.object({ number, lines: z.array(line).min(1).max(200), pricing, shippingAddress: address.nullish(), orderUrl: siteUrl(ctx) }),
    build: (d, ctx) => {
      const p = d.pricing;
      const totals = [
        { label: "Subtotal", value: formatCents(p.subtotalCents) },
        ...(p.discountCents > 0 ? [{ label: "Discount", value: `−${formatCents(p.discountCents)}` }] : []),
        { label: "Shipping", value: p.shippingCents === 0 ? "Free" : formatCents(p.shippingCents) },
        { label: "Total", value: formatCents(p.totalCents), strong: true },
        { label: `Includes VAT (${p.taxRatePercent}%)`, value: formatCents(p.taxCents) },
      ];
      const a = d.shippingAddress;
      const blocks: Block[] = [
        { kind: "heading", text: `Thank you for your order` },
        hello({}, ctx),
        { kind: "paragraph", text: `We have received your payment for order ${d.number}. We will let you know as soon as it ships.` },
        { kind: "rows", rows: d.lines.map((l) => ({ label: `${l.productName}\n${l.variantLabel} × ${l.qty}`, value: formatCents(l.lineTotalCents) })) },
        { kind: "rows", rows: totals },
      ];
      if (a) blocks.push({ kind: "quote", text: ["Delivering to:", a.fullName, a.line1, a.line2, `${a.postalCode} ${a.city}`, a.country].filter(Boolean).join("\n") });
      blocks.push(orderButton(d.orderUrl));
      return { subject: `Order ${d.number} confirmed`, preheader: `Order ${d.number}: ${formatCents(p.totalCents)} paid.`, blocks };
    },
  }),
  "order-shipped": define({
    schema: (ctx) => z.object({ number, carrier: z.string().min(1).max(80), trackingNumber: z.string().min(1).max(120), trackingUrl: httpUrl, orderUrl: siteUrl(ctx) }),
    build: (d, ctx) => ({
      subject: `Order ${d.number} is on its way`,
      preheader: `${d.carrier} tracking number ${d.trackingNumber}.`,
      blocks: [
        { kind: "heading", text: "Your order has shipped" },
        hello({}, ctx),
        { kind: "paragraph", text: `Good news: order ${d.number} has left our workshop.` },
        { kind: "rows", rows: [{ label: "Carrier", value: d.carrier }, { label: "Tracking number", value: d.trackingNumber }] },
        { kind: "link", label: "Track your parcel", url: d.trackingUrl },
        orderButton(d.orderUrl),
      ],
    }),
  }),
  "order-delivered": define({
    schema: (ctx) => z.object({ number, orderUrl: siteUrl(ctx), reviewUrls: z.array(z.object({ productName: z.string().max(200), url: siteUrl(ctx) })).max(50) }),
    build: (d, ctx) => ({
      subject: `Order ${d.number} was delivered`,
      preheader: "We hope you love it. Tell others what you think.",
      blocks: [
        { kind: "heading", text: "Delivered" },
        hello({}, ctx),
        { kind: "paragraph", text: `Order ${d.number} has been delivered. We hope it feels at home already.` },
        ...(d.reviewUrls.length ? [{ kind: "paragraph", text: "Would you share a few words about your new pieces?" } as Block] : []),
        ...d.reviewUrls.map((r): Block => ({ kind: "link", label: `Review ${r.productName}`, url: r.url })),
        orderButton(d.orderUrl),
      ],
    }),
  }),
  "order-cancelled": define({
    schema: (ctx) => z.object({ number, reason: z.string().min(1).max(40), refundRequired: z.boolean(), orderUrl: siteUrl(ctx) }),
    build: (d, ctx) => ({
      subject: `Order ${d.number} was cancelled`,
      preheader: `Order ${d.number} has been cancelled.`,
      blocks: [
        { kind: "heading", text: "Order cancelled" },
        hello({}, ctx),
        { kind: "paragraph", text: `Order ${d.number} has been cancelled because ${CANCEL_REASONS[d.reason] ?? "it could not be completed"}.` },
        { kind: "paragraph", text: d.refundRequired ? "A full refund of your payment is on its way. It usually appears within 5–10 business days." : "You have not been charged for this order." },
        orderButton(d.orderUrl),
      ],
    }),
  }),
  "order-refunded": define({
    schema: (ctx) => z.object({ number, amountCents: cents.min(1), full: z.boolean(), orderUrl: siteUrl(ctx) }),
    build: (d, ctx) => ({
      subject: `Refund issued for order ${d.number}`,
      preheader: `${formatCents(d.amountCents)} is on its way back to you.`,
      blocks: [
        { kind: "heading", text: d.full ? "Your order was refunded" : "Partial refund issued" },
        hello({}, ctx),
        { kind: "paragraph", text: `We have refunded ${formatCents(d.amountCents)} for order ${d.number}${d.full ? " in full" : ""}. It usually appears on your statement within 5–10 business days.` },
        orderButton(d.orderUrl),
      ],
    }),
  }),
  "return-received": define({
    schema: (ctx) => z.object({ number, orderUrl: siteUrl(ctx) }),
    build: (d, ctx) => ({
      subject: `We received your return request for order ${d.number}`,
      preheader: "Our team will review it within two business days.",
      blocks: [
        { kind: "heading", text: "Return request received" },
        hello({}, ctx),
        { kind: "paragraph", text: `Thanks for letting us know. We will review your return for order ${d.number} and get back to you within two business days.` },
        orderButton(d.orderUrl),
      ],
    }),
  }),
  "return-approved": define({
    schema: (ctx) => z.object({ number, refundCents: cents.min(0), orderUrl: siteUrl(ctx) }),
    build: (d, ctx) => ({
      subject: `Return approved for order ${d.number}`,
      preheader: `Refund of ${formatCents(d.refundCents)} on its way.`,
      blocks: [
        { kind: "heading", text: "Return approved" },
        hello({}, ctx),
        { kind: "paragraph", text: `Your return for order ${d.number} has been approved.${d.refundCents > 0 ? ` We are refunding ${formatCents(d.refundCents)}.` : ""}` },
        orderButton(d.orderUrl),
      ],
    }),
  }),
  "return-rejected": define({
    schema: (ctx) => z.object({ number, note: z.string().max(2000), orderUrl: siteUrl(ctx) }),
    build: (d, ctx) => ({
      subject: `Update on your return for order ${d.number}`,
      preheader: "We could not accept this return.",
      blocks: [
        { kind: "heading", text: "About your return" },
        hello({}, ctx),
        { kind: "paragraph", text: `We are sorry, but we could not accept the return for order ${d.number}.` },
        ...(d.note.trim() ? [{ kind: "quote", text: d.note.trim() } as Block] : []),
        { kind: "paragraph", text: "If you have questions, just reply through our contact form and we will help." },
        orderButton(d.orderUrl),
      ],
    }),
  }),
  "invoice-issued": define({
    schema: (ctx) => z.object({ number, invoiceNumber: z.string().min(1).max(60), orderUrl: siteUrl(ctx) }),
    build: (d, ctx) => ({
      subject: `Invoice ${d.invoiceNumber} for order ${d.number}`,
      preheader: "Your invoice is ready to download.",
      blocks: [
        { kind: "heading", text: "Your invoice is ready" },
        hello({}, ctx),
        { kind: "paragraph", text: `Invoice ${d.invoiceNumber} for order ${d.number} is ready. You can download it from your order page.` },
        orderButton(d.orderUrl),
      ],
    }),
  }),
  "newsletter-confirm": define({
    schema: (ctx) => z.object({ confirmUrl: siteUrl(ctx) }),
    build: (d) => ({
      subject: "Confirm your Meridian newsletter subscription",
      preheader: "One click and you are on the list.",
      blocks: [
        { kind: "heading", text: "Almost there" },
        { kind: "paragraph", text: "Please confirm that you want to receive the Meridian newsletter: new collections, workshop stories and the occasional offer." },
        { kind: "button", label: "Confirm subscription", url: d.confirmUrl },
        { kind: "note", text: "The link is valid for 48 hours. If you did not sign up, ignore this email and you will not hear from us." },
      ],
    }),
  }),
  "newsletter-welcome": define({
    schema: (ctx) => z.object({ unsubscribeUrl: siteUrl(ctx) }),
    build: (d, ctx) => ({
      subject: "Welcome to the Meridian newsletter",
      preheader: "Thanks for subscribing.",
      blocks: [
        { kind: "heading", text: "Welcome" },
        { kind: "paragraph", text: "You are subscribed. Expect a letter from our workshop about once a month." },
        { kind: "button", label: "Visit Meridian", url: ctx.siteOrigin },
        { kind: "note", text: "Changed your mind? You can unsubscribe at any time." },
        { kind: "link", label: "Unsubscribe", url: d.unsubscribeUrl },
      ],
    }),
  }),
  "contact-received": define({
    schema: () => z.object({ name }),
    build: (d, ctx) => ({
      subject: "We received your message",
      preheader: "Our team usually answers within one business day.",
      blocks: [
        { kind: "heading", text: "Thanks for getting in touch" },
        hello(d, ctx),
        { kind: "paragraph", text: "We have received your message and will reply within one business day." },
      ],
    }),
  }),
  "contact-internal": define({
    schema: () =>
      z.object({
        name: z.string().min(1).max(200),
        email: z.string().email().max(254),
        topic: z.string().min(1).max(40),
        orderNumber: z.string().max(40).nullish(),
        message: z.string().min(1).max(5000),
      }),
    build: (d) => ({
      subject: `Contact form: ${TOPICS[d.topic] ?? d.topic} from ${d.name}`,
      preheader: d.message.slice(0, 90),
      replyTo: d.email,
      blocks: [
        { kind: "heading", text: "New contact message" },
        {
          kind: "rows",
          rows: [
            { label: "From", value: d.name },
            { label: "Email", value: d.email },
            { label: "Topic", value: TOPICS[d.topic] ?? d.topic },
            ...(d.orderNumber ? [{ label: "Order", value: d.orderNumber }] : []),
          ],
        },
        { kind: "quote", text: d.message },
        { kind: "note", text: "Reply to this email to answer the customer directly." },
      ],
    }),
  }),
  "back-in-stock": define({
    schema: (ctx) => z.object({ productName: z.string().min(1).max(200), productUrl: siteUrl(ctx) }),
    build: (d) => ({
      subject: `${d.productName} is back in stock`,
      preheader: "The piece you were waiting for is available again.",
      blocks: [
        { kind: "heading", text: "Back in stock" },
        { kind: "paragraph", text: `Good news: ${d.productName} is available again. Stock is limited, so do not wait too long.` },
        { kind: "button", label: `Shop ${d.productName}`, url: d.productUrl },
        { kind: "note", text: "You asked us to tell you when this piece returned. This is a one-time alert." },
      ],
    }),
  }),
};

export function sandboxSubject(subject: string): string {
  return subjectText(`${SANDBOX_SUBJECT_PREFIX} ${subject}`, 200);
}
