import { ConsumerGroups } from "@meridian/contracts";
import { createLogger } from "@meridian/nest-kit";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { applyProductChange, ContactMessage, displayProductName, EmailAddress, normalizeSku, planOrderEmail, StockAlert, type ProductDirectoryEntry } from "../../domain";
import { IdGenerator, NOTIFICATION_SETTINGS, SiteLinks, UnitOfWork, type NotificationSettings } from "../ports";
import {
  CreateStockAlertCommand,
  DispatchOrderEmailCommand,
  ForgetCustomerCommand,
  NotifyStockAlertsCommand,
  ProjectProductCommand,
  RecordOrderRecipientCommand,
  SubmitContactMessageCommand,
} from "./engagement.commands";

const log = createLogger("NotificationDispatcher");
const GROUP = ConsumerGroups.notificationDispatcher;
/** Alerts handled per transaction; a hot SKU with thousands of waiting shoppers is drained in batches. */
export const STOCK_ALERT_BATCH = 200;

@CommandHandler(SubmitContactMessageCommand)
export class SubmitContactMessageHandler implements ICommandHandler<SubmitContactMessageCommand, { id: string }> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(NOTIFICATION_SETTINGS) private readonly settings: NotificationSettings,
  ) {}

  async execute({ request, correlationId }: SubmitContactMessageCommand): Promise<{ id: string }> {
    const email = EmailAddress.parse(request.email);
    const message = ContactMessage.receive({ id: this.ids.next("msg"), name: request.name, email, topic: request.topic, orderNumber: request.orderNumber, message: request.message, correlationId, now: this.clock.now() });
    const m = message.snapshot();
    await this.uow.run(async (tx) => {
      await tx.contacts.add(message);
      await tx.enqueueEmail({
        template: "contact-internal",
        to: { email: this.settings.supportEmail, name: "Meridian support" },
        data: { name: m.name, email: m.email, topic: m.topic, orderNumber: m.orderNumber, message: m.message },
        dedupeKey: `contact-internal:${m.id}`,
      });
      await tx.enqueueEmail({ template: "contact-received", to: { email: m.email, name: m.name }, data: { name: m.name }, dedupeKey: `contact-received:${m.id}` });
    });
    log.info("contact message received", { messageId: m.id, topic: m.topic });
    return { id: m.id };
  }
}

@CommandHandler(CreateStockAlertCommand)
export class CreateStockAlertHandler implements ICommandHandler<CreateStockAlertCommand, { created: boolean }> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ email, sku, slug }: CreateStockAlertCommand): Promise<{ created: boolean }> {
    const alert = StockAlert.create(this.ids.next("alr"), EmailAddress.parse(email), sku, slug, this.clock.now());
    // One pending alert per address and SKU: a repeated request is accepted without creating a second alert.
    const created = await this.uow.run((tx) => tx.alerts.insertIfNoPending(alert));
    return { created };
  }
}

@CommandHandler(NotifyStockAlertsCommand)
export class NotifyStockAlertsHandler implements ICommandHandler<NotifyStockAlertsCommand, { notified: number }> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: SiteLinks,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ sku: rawSku, messageId }: NotifyStockAlertsCommand): Promise<{ notified: number }> {
    let sku: string;
    try {
      sku = normalizeSku(rawSku);
    } catch {
      // Alerts are only ever created for well-formed SKUs, so nobody can be waiting for this one.
      return { notified: 0 };
    }
    // Naturally idempotent without an inbox mark: an alert leaves "pending" in the same transaction that enqueues its
    // email, so a redelivered event (or a failure between batches) only picks up alerts that were not handled yet.
    let notified = 0;
    for (;;) {
      const handled = await this.uow.run(async (tx) => {
        const alerts = await tx.alerts.lockPendingForSku(sku, STOCK_ALERT_BATCH);
        const now = this.clock.now();
        // Alerts of one SKU normally share a slug; look each slug up once per batch.
        const products = new Map<string, ProductDirectoryEntry | null>();
        for (const alert of alerts) {
          if (!products.has(alert.slug)) products.set(alert.slug, await tx.products.findBySlug(alert.slug));
          alert.markNotified(now);
          await tx.alerts.save(alert);
          await tx.enqueueEmail({
            template: "back-in-stock",
            to: { email: alert.email, name: null },
            data: { productName: displayProductName(products.get(alert.slug) ?? null, alert.slug), productUrl: this.links.productUrl(alert.slug) },
            dedupeKey: `back-in-stock:${alert.id}`,
          });
        }
        return alerts.length;
      });
      notified += handled;
      if (handled < STOCK_ALERT_BATCH) break;
    }
    if (notified) log.info("stock alerts notified", { sku, notified, messageId });
    return { notified };
  }
}

@CommandHandler(ProjectProductCommand)
export class ProjectProductHandler implements ICommandHandler<ProjectProductCommand, { applied: boolean }> {
  constructor(private readonly uow: UnitOfWork) {}

  async execute({ change, messageId }: ProjectProductCommand): Promise<{ applied: boolean }> {
    return this.uow.run(async (tx) => {
      // Inbox first: a redelivered message is a no-op. Ordering is guarded separately by the entry version, so a
      // replayed older event (new messageId on the replay topic) cannot regress the directory either.
      if (!(await tx.claim(GROUP, messageId))) return { applied: false };
      const next = applyProductChange(await tx.products.lock(change.productId), change);
      if (!next) return { applied: false };
      await tx.products.save(next);
      log.info("product directory updated", { productId: next.productId, slug: next.slug, archived: next.archived, messageId });
      return { applied: true };
    });
  }
}

@CommandHandler(RecordOrderRecipientCommand)
export class RecordOrderRecipientHandler implements ICommandHandler<RecordOrderRecipientCommand, void> {
  constructor(
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ payload }: RecordOrderRecipientCommand): Promise<void> {
    // Idempotent by orderId (never overwrites), so no inbox row is needed for this projection.
    await this.uow.run((tx) =>
      tx.orders.remember({ orderId: payload.orderId, number: payload.number, customer: payload.customer, shippingAddress: payload.shippingAddress }, this.clock.now()),
    );
  }
}

@CommandHandler(DispatchOrderEmailCommand)
export class DispatchOrderEmailHandler implements ICommandHandler<DispatchOrderEmailCommand, { enqueued: boolean }> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: SiteLinks,
  ) {}

  async execute({ event, messageId }: DispatchOrderEmailCommand): Promise<{ enqueued: boolean }> {
    return this.uow.run(async (tx) => {
      if (!(await tx.claim(GROUP, messageId))) return { enqueued: false };
      const stored = event.name === "OrderPaid" ? await tx.orders.find(event.payload.orderId) : null;
      const request = planOrderEmail(event, this.links, stored);
      await tx.enqueueEmail(request);
      log.info("order email enqueued", { event: event.name, orderId: event.payload.orderId, template: request.template });
      return { enqueued: true };
    });
  }
}

@CommandHandler(ForgetCustomerCommand)
export class ForgetCustomerHandler implements ICommandHandler<ForgetCustomerCommand, { alertsDeleted: number; unsubscribed: boolean }> {
  constructor(
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, email, messageId }: ForgetCustomerCommand): Promise<{ alertsDeleted: number; unsubscribed: boolean }> {
    const address = EmailAddress.parse(email).value;
    return this.uow.run(async (tx) => {
      if (!(await tx.claim(GROUP, messageId))) return { alertsDeleted: 0, unsubscribed: false };
      const subscription = await tx.subscriptions.lockByEmail(address);
      if (subscription) {
        subscription.forget(this.clock.now());
        await tx.subscriptions.save(subscription);
      }
      const alertsDeleted = await tx.alerts.deleteByEmail(address);
      await tx.orders.forgetCustomer(userId, address);
      log.info("customer forgotten", { userId, alertsDeleted, unsubscribed: Boolean(subscription) });
      return { alertsDeleted, unsubscribed: Boolean(subscription) };
    });
  }
}
