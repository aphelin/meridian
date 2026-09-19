import type { EventPayloads } from "@meridian/contracts";
import { FixedClock } from "@meridian/kernel";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryUnitOfWork, SequentialIds, TestLinks, testSettings, tokenFrom } from "../../test-support/in-memory";
import {
  CreateStockAlertCommand,
  DispatchOrderEmailCommand,
  ForgetCustomerCommand,
  NotifyStockAlertsCommand,
  ProjectProductCommand,
  RecordOrderRecipientCommand,
  SubmitContactMessageCommand,
} from "./engagement.commands";
import {
  CreateStockAlertHandler,
  DispatchOrderEmailHandler,
  ForgetCustomerHandler,
  NotifyStockAlertsHandler,
  ProjectProductHandler,
  RecordOrderRecipientHandler,
  STOCK_ALERT_BATCH,
  SubmitContactMessageHandler,
} from "./engagement.handlers";
import { ConfirmNewsletterCommand, SubscribeNewsletterCommand, UnsubscribeNewsletterCommand } from "./newsletter.commands";
import { ConfirmNewsletterHandler, SubscribeNewsletterHandler, UnsubscribeNewsletterHandler } from "./newsletter.handlers";

const clock = new FixedClock(new Date("2026-09-17T10:00:00Z"));
const links = new TestLinks();

describe("newsletter double opt-in handlers", () => {
  let uow: InMemoryUnitOfWork;
  let subscribe: SubscribeNewsletterHandler;
  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    subscribe = new SubscribeNewsletterHandler(uow, links, new SequentialIds(), clock);
  });

  it("newsletter subscribe enqueues a confirm mail, confirm sends welcome, unsubscribe works", async () => {
    await subscribe.execute(new SubscribeNewsletterCommand("Reader@Example.com"));
    const [confirmMail] = uow.emails("newsletter-confirm");
    expect(confirmMail.to.email).toBe("reader@example.com");
    const confirmed = await new ConfirmNewsletterHandler(uow, links, clock).execute(new ConfirmNewsletterCommand(tokenFrom(confirmMail.data.confirmUrl as string)));
    expect(confirmed.status).toBe("confirmed");
    const [welcome] = uow.emails("newsletter-welcome");
    const result = await new UnsubscribeNewsletterHandler(uow, clock).execute(new UnsubscribeNewsletterCommand(tokenFrom(welcome.data.unsubscribeUrl as string)));
    expect(result.status).toBe("unsubscribed");
  });

  it("newsletter subscribe for a confirmed address sends nothing (no enumeration, no spam)", async () => {
    await subscribe.execute(new SubscribeNewsletterCommand("reader@example.com"));
    await new ConfirmNewsletterHandler(uow, links, clock).execute(new ConfirmNewsletterCommand(tokenFrom(uow.emails("newsletter-confirm")[0].data.confirmUrl as string)));
    await expect(subscribe.execute(new SubscribeNewsletterCommand("reader@example.com"))).resolves.toEqual({ accepted: true });
    expect(uow.emails("newsletter-confirm")).toHaveLength(1);
  });

  it("newsletter confirm rejects unknown or malformed tokens with TOKEN_INVALID", async () => {
    const handler = new ConfirmNewsletterHandler(uow, links, clock);
    await expect(handler.execute(new ConfirmNewsletterCommand("nope"))).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    await expect(handler.execute(new ConfirmNewsletterCommand("A".repeat(43)))).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("repeated newsletter requests mail distinct links with distinct dedupe keys", async () => {
    await subscribe.execute(new SubscribeNewsletterCommand("reader@example.com"));
    await subscribe.execute(new SubscribeNewsletterCommand("reader@example.com"));
    const mails = uow.emails("newsletter-confirm");
    expect(mails).toHaveLength(2);
    expect(new Set(mails.map((m) => m.dedupeKey)).size).toBe(2);
  });
});

describe("contact form handler", () => {
  it("contact message is stored and mails support (reply-to sender data) and the sender", async () => {
    const uow = new InMemoryUnitOfWork();
    await new SubmitContactMessageHandler(uow, new SequentialIds(), clock, testSettings).execute(
      new SubmitContactMessageCommand({ name: "Ada", email: "ada@example.com", topic: "order", orderNumber: "M-ABC", message: "Where is my sofa please?" }, "corr-9"),
    );
    expect(uow.db.contacts).toEqual([expect.objectContaining({ email: "ada@example.com", correlationId: "corr-9" })]);
    expect(uow.emails("contact-internal")[0]).toMatchObject({ to: { email: "support@meridian.local" }, data: { email: "ada@example.com", orderNumber: "M-ABC" } });
    expect(uow.emails("contact-received")[0].to.email).toBe("ada@example.com");
  });

  it("contact message validation failures enqueue nothing", async () => {
    const uow = new InMemoryUnitOfWork();
    const handler = new SubmitContactMessageHandler(uow, new SequentialIds(), clock, testSettings);
    await expect(handler.execute(new SubmitContactMessageCommand({ name: "Ada", email: "bad", topic: "order", message: "Where is my sofa please?" }, "c"))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(uow.emails()).toHaveLength(0);
  });
});

describe("stock alert handlers", () => {
  it("stock alert: one pending alert per email and sku, notified once on StockReplenished", async () => {
    const uow = new InMemoryUnitOfWork();
    const create = new CreateStockAlertHandler(uow, new SequentialIds(), clock);
    expect((await create.execute(new CreateStockAlertCommand("a@example.com", "holt-cha-3", "holt-sofa"))).created).toBe(true);
    expect((await create.execute(new CreateStockAlertCommand("A@example.com", "HOLT-CHA-3", "holt-sofa"))).created).toBe(false);
    const notify = new NotifyStockAlertsHandler(uow, links, clock);
    expect((await notify.execute(new NotifyStockAlertsCommand("HOLT-CHA-3", "m1"))).notified).toBe(1);
    expect((await notify.execute(new NotifyStockAlertsCommand("HOLT-CHA-3", "m2"))).notified).toBe(0);
    expect(uow.emails("back-in-stock")).toEqual([
      expect.objectContaining({ to: { email: "a@example.com", name: null }, data: { productName: "Holt sofa", productUrl: "http://site.test/product/holt-sofa" } }),
    ]);
  });

  it("stock alert notification drains more alerts than one batch", async () => {
    const uow = new InMemoryUnitOfWork();
    const create = new CreateStockAlertHandler(uow, new SequentialIds(), clock);
    for (let i = 0; i < STOCK_ALERT_BATCH + 3; i++) await create.execute(new CreateStockAlertCommand(`s${i}@example.com`, "SKU-1", "holt-sofa"));
    expect((await new NotifyStockAlertsHandler(uow, links, clock).execute(new NotifyStockAlertsCommand("SKU-1", "m"))).notified).toBe(STOCK_ALERT_BATCH + 3);
  });
});

describe("product directory (amendment 1o)", () => {
  const published = (versionAt: string, name = "Holt Sofa", extra: Partial<{ slug: string; archived: boolean; heroImageUrl: string | null }> = {}) => ({
    kind: "snapshot" as const,
    productId: "prd_holt",
    slug: "holt-sofa",
    name,
    heroImageUrl: "/products/holt-hero.jpg",
    archived: false,
    versionAt: new Date(versionAt),
    ...extra,
  });
  const archived = (versionAt: string) => ({ kind: "archived" as const, productId: "prd_holt", slug: "holt-sofa", versionAt: new Date(versionAt) });

  it("stock alert back-in-stock email uses the catalog product name, and the slug only for unknown products", async () => {
    const uow = new InMemoryUnitOfWork();
    await new ProjectProductHandler(uow).execute(new ProjectProductCommand(published("2026-09-01T10:00:00Z", "Holt Three-Seat Sofa"), "p1"));
    const create = new CreateStockAlertHandler(uow, new SequentialIds(), clock);
    await create.execute(new CreateStockAlertCommand("a@example.com", "HOLT-CHA-3", "holt-sofa"));
    await create.execute(new CreateStockAlertCommand("b@example.com", "HOLT-CHA-3", "mystery-lamp"));
    await new NotifyStockAlertsHandler(uow, links, clock).execute(new NotifyStockAlertsCommand("HOLT-CHA-3", "m1"));
    const byEmail = Object.fromEntries(uow.emails("back-in-stock").map((e) => [e.to.email, e.data]));
    expect(byEmail["a@example.com"]).toEqual({ productName: "Holt Three-Seat Sofa", productUrl: "http://site.test/product/holt-sofa" });
    expect(byEmail["b@example.com"]).toEqual({ productName: "Mystery lamp", productUrl: "http://site.test/product/mystery-lamp" });
  });

  it("product directory ordering: an older ProductUpdated never regresses a newer entry", async () => {
    const uow = new InMemoryUnitOfWork();
    const project = new ProjectProductHandler(uow);
    expect((await project.execute(new ProjectProductCommand(published("2026-09-02T10:00:00Z", "Holt v2"), "p2"))).applied).toBe(true);
    expect((await project.execute(new ProjectProductCommand(published("2026-09-01T10:00:00Z", "Holt v1"), "p1"))).applied).toBe(false);
    expect((await project.execute(new ProjectProductCommand(published("2026-09-02T10:00:00Z", "Holt tie"), "p2b"))).applied).toBe(false);
    expect(uow.db.products.get("prd_holt")).toMatchObject({ name: "Holt v2", archived: false });
    expect((await project.execute(new ProjectProductCommand(published("2026-09-03T10:00:00Z", "Holt v3", { heroImageUrl: null }), "p3"))).applied).toBe(true);
    expect(uow.db.products.get("prd_holt")).toMatchObject({ name: "Holt v3", heroImageUrl: null });
  });

  it("product directory ordering: archived products stay known, older snapshots cannot un-archive, newer ones can", async () => {
    const uow = new InMemoryUnitOfWork();
    const project = new ProjectProductHandler(uow);
    await project.execute(new ProjectProductCommand(published("2026-09-01T10:00:00Z"), "p1"));
    expect((await project.execute(new ProjectProductCommand(archived("2026-09-05T10:00:00Z"), "a1"))).applied).toBe(true);
    expect(uow.db.products.get("prd_holt")).toMatchObject({ name: "Holt Sofa", archived: true });
    // replayed ProductPublished from before the archive
    expect((await project.execute(new ProjectProductCommand(published("2026-09-01T10:00:00Z"), "replay-p1"))).applied).toBe(false);
    expect(uow.db.products.get("prd_holt")?.archived).toBe(true);
    // the name of an archived product is still used in emails
    const create = new CreateStockAlertHandler(uow, new SequentialIds(), clock);
    await create.execute(new CreateStockAlertCommand("a@example.com", "HOLT-CHA-3", "holt-sofa"));
    await new NotifyStockAlertsHandler(uow, links, clock).execute(new NotifyStockAlertsCommand("HOLT-CHA-3", "m1"));
    expect(uow.emails("back-in-stock")[0].data.productName).toBe("Holt Sofa");
    // re-published later
    expect((await project.execute(new ProjectProductCommand(published("2026-09-06T10:00:00Z"), "p2"))).applied).toBe(true);
    expect(uow.db.products.get("prd_holt")?.archived).toBe(false);
  });

  it("product directory ordering: an archive seen before the publish keeps the product archived but learns its name", async () => {
    const uow = new InMemoryUnitOfWork();
    const project = new ProjectProductHandler(uow);
    await project.execute(new ProjectProductCommand(archived("2026-09-05T10:00:00Z"), "a1"));
    expect(uow.db.products.get("prd_holt")).toMatchObject({ name: null, archived: true });
    expect((await project.execute(new ProjectProductCommand(published("2026-09-01T10:00:00Z", "Holt Sofa"), "p1"))).applied).toBe(true);
    expect(uow.db.products.get("prd_holt")).toMatchObject({ name: "Holt Sofa", archived: true, versionAt: new Date("2026-09-05T10:00:00Z") });
  });

  it("product directory idempotency: a redelivered message is skipped through the inbox and a failed transaction is retried", async () => {
    const uow = new InMemoryUnitOfWork();
    const project = new ProjectProductHandler(uow);
    uow.failNext = 1;
    await expect(project.execute(new ProjectProductCommand(published("2026-09-02T10:00:00Z", "Holt v2"), "p2"))).rejects.toThrow("simulated");
    expect(uow.db.products.size).toBe(0);
    expect((await project.execute(new ProjectProductCommand(published("2026-09-02T10:00:00Z", "Holt v2"), "p2"))).applied).toBe(true);
    // same messageId redelivered, even with a payload that would otherwise win, is a no-op
    expect((await project.execute(new ProjectProductCommand(published("2026-09-09T10:00:00Z", "Tampered"), "p2"))).applied).toBe(false);
    expect(uow.db.products.get("prd_holt")?.name).toBe("Holt v2");
    expect(uow.db.inbox.has("notification-dispatcher:p2")).toBe(true);
  });
});

describe("order dispatch handlers", () => {
  const header = { orderId: "ord_9", number: "M-PROBE777", customer: { userId: null, email: "buyer@example.com", name: "Buyer" } };
  const pricing = { subtotalCents: 240000, discountCents: 24000, shippingCents: 0, taxCents: 36000, taxRatePercent: 20, totalCents: 216000, currency: "EUR" as const };
  const address = { fullName: "Buyer", line1: "1 Road", line2: null, city: "Tbilisi", postalCode: "0105", country: "GE", phone: null };

  it("order confirmation dispatch uses the address remembered from OrderPlaced and is idempotent per message", async () => {
    const uow = new InMemoryUnitOfWork();
    const placed: EventPayloads["OrderPlaced"] = { ...header, lines: [], pricing, shippingAddress: address, shippingMethod: "standard", couponCode: null, placedAt: "x" };
    await new RecordOrderRecipientHandler(uow, clock).execute(new RecordOrderRecipientCommand(placed, "m0"));
    const dispatch = new DispatchOrderEmailHandler(uow, links);
    const event = { name: "OrderPaid" as const, payload: { ...header, lines: [], pricing, paymentId: "p", paidAt: "x" } };
    expect((await dispatch.execute(new DispatchOrderEmailCommand(event, "m1"))).enqueued).toBe(true);
    expect((await dispatch.execute(new DispatchOrderEmailCommand(event, "m1"))).enqueued).toBe(false);
    const [mail] = uow.emails("order-confirmation");
    expect(mail.data).toMatchObject({ shippingAddress: address, orderUrl: "http://site.test/orders/ord_9?access=guest-token" });
    expect(uow.emails()).toHaveLength(1);
  });

  it("UserDeleted unsubscribes the newsletter and deletes stock alerts and stored addresses", async () => {
    const uow = new InMemoryUnitOfWork();
    await new SubscribeNewsletterHandler(uow, links, new SequentialIds(), clock).execute(new SubscribeNewsletterCommand("gone@example.com"));
    await new CreateStockAlertHandler(uow, new SequentialIds(), clock).execute(new CreateStockAlertCommand("gone@example.com", "SKU-1", "holt-sofa"));
    const result = await new ForgetCustomerHandler(uow, clock).execute(new ForgetCustomerCommand("usr_1", "gone@example.com", "m"));
    expect(result).toEqual({ alertsDeleted: 1, unsubscribed: true });
    expect([...uow.db.subscriptions.values()][0]).toMatchObject({ status: "unsubscribed", confirmTokenHash: null });
    expect(uow.db.alerts.size).toBe(0);
  });
});
