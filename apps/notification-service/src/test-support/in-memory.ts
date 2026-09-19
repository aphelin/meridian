import type { EmailTemplate } from "@meridian/contracts";
import {
  ContactMessageRepository,
  EmailDelivery,
  EmailDeliveryRepository,
  NewsletterSubscription,
  NewsletterSubscriptionRepository,
  OrderRecipientRepository,
  ProductDirectoryRepository,
  StockAlert,
  StockAlertRepository,
  type ContactMessage,
  type ContactMessageState,
  type EmailDeliveryState,
  type EmailRequest,
  type NewsletterSubscriptionState,
  type NotificationEvent,
  type OrderRecipient,
  type ProductDirectoryEntry,
  type StockAlertState,
} from "../domain";
import {
  EmailRenderer,
  IdGenerator,
  Mailer,
  SiteLinks,
  UnitOfWork,
  type MailReceipt,
  type NotificationSettings,
  type NotificationTransaction,
  type OutgoingEmail,
  type RenderedEmail,
} from "../application/ports";

interface Db {
  deliveries: Map<string, EmailDeliveryState>;
  subscriptions: Map<string, NewsletterSubscriptionState>;
  contacts: ContactMessageState[];
  alerts: Map<string, StockAlertState>;
  orders: Map<string, OrderRecipient>;
  products: Map<string, ProductDirectoryEntry>;
  outboxEvents: NotificationEvent[];
  outboxEmails: EmailRequest[];
  inbox: Set<string>;
}

const empty = (): Db => ({ deliveries: new Map(), subscriptions: new Map(), contacts: [], alerts: new Map(), orders: new Map(), products: new Map(), outboxEvents: [], outboxEmails: [], inbox: new Set() });

const clone = (db: Db): Db => ({
  deliveries: new Map([...db.deliveries].map(([k, v]) => [k, { ...v }])),
  subscriptions: new Map([...db.subscriptions].map(([k, v]) => [k, { ...v }])),
  contacts: db.contacts.map((c) => ({ ...c })),
  alerts: new Map([...db.alerts].map(([k, v]) => [k, { ...v }])),
  orders: new Map(db.orders),
  products: new Map([...db.products].map(([k, v]) => [k, { ...v }])),
  outboxEvents: [...db.outboxEvents],
  outboxEmails: [...db.outboxEmails],
  inbox: new Set(db.inbox),
});

class Deliveries extends EmailDeliveryRepository {
  constructor(private readonly db: Db) {
    super();
  }
  async insertIfMissing(delivery: EmailDelivery) {
    const s = delivery.snapshot();
    if ([...this.db.deliveries.values()].some((d) => d.dedupeKey === s.dedupeKey)) return false;
    this.db.deliveries.set(s.id, s);
    return true;
  }
  async lockByDedupeKey(key: string) {
    const row = [...this.db.deliveries.values()].find((d) => d.dedupeKey === key);
    return row ? EmailDelivery.restore(row) : null;
  }
  async save(delivery: EmailDelivery) {
    this.db.deliveries.set(delivery.id, delivery.snapshot());
  }
}

class Subscriptions extends NewsletterSubscriptionRepository {
  constructor(private readonly db: Db) {
    super();
  }
  private find(predicate: (s: NewsletterSubscriptionState) => boolean) {
    const row = [...this.db.subscriptions.values()].find(predicate);
    return row ? NewsletterSubscription.restore(row) : null;
  }
  async insertIfMissing(subscription: NewsletterSubscription) {
    const s = subscription.snapshot();
    if (this.find((x) => x.email === s.email)) return false;
    this.db.subscriptions.set(s.id, s);
    return true;
  }
  async lockByEmail(email: string) {
    return this.find((s) => s.email === email);
  }
  async lockByConfirmTokenHash(hash: string) {
    return this.find((s) => s.confirmTokenHash === hash);
  }
  async lockByUnsubscribeTokenHash(hash: string) {
    return this.find((s) => s.unsubscribeTokenHash === hash);
  }
  async save(subscription: NewsletterSubscription) {
    this.db.subscriptions.set(subscription.id, subscription.snapshot());
  }
}

class Contacts extends ContactMessageRepository {
  constructor(private readonly db: Db) {
    super();
  }
  async add(message: ContactMessage) {
    this.db.contacts.push(message.snapshot());
  }
}

class Alerts extends StockAlertRepository {
  constructor(private readonly db: Db) {
    super();
  }
  async insertIfNoPending(alert: StockAlert) {
    const s = alert.snapshot();
    if ([...this.db.alerts.values()].some((a) => a.status === "pending" && a.email === s.email && a.sku === s.sku)) return false;
    this.db.alerts.set(s.id, s);
    return true;
  }
  async lockPendingForSku(sku: string, limit: number) {
    return [...this.db.alerts.values()]
      .filter((a) => a.sku === sku && a.status === "pending")
      .slice(0, limit)
      .map((a) => StockAlert.restore(a));
  }
  async save(alert: StockAlert) {
    this.db.alerts.set(alert.id, alert.snapshot());
  }
  async deleteByEmail(email: string) {
    let n = 0;
    for (const [id, a] of this.db.alerts) if (a.email === email && this.db.alerts.delete(id)) n++;
    return n;
  }
}

class Orders extends OrderRecipientRepository {
  constructor(private readonly db: Db) {
    super();
  }
  async remember(recipient: OrderRecipient) {
    if (!this.db.orders.has(recipient.orderId)) this.db.orders.set(recipient.orderId, recipient);
  }
  async find(orderId: string) {
    return this.db.orders.get(orderId) ?? null;
  }
  async forgetCustomer(userId: string, email: string) {
    let n = 0;
    for (const [id, o] of this.db.orders) if ((o.customer.userId === userId || o.customer.email.toLowerCase() === email) && this.db.orders.delete(id)) n++;
    return n;
  }
}

class Products extends ProductDirectoryRepository {
  constructor(private readonly db: Db) {
    super();
  }
  async lock(productId: string) {
    const row = this.db.products.get(productId);
    return row ? { ...row } : null;
  }
  async save(entry: ProductDirectoryEntry) {
    this.db.products.set(entry.productId, { ...entry });
  }
  async findBySlug(slug: string) {
    const rows = [...this.db.products.values()].filter((p) => p.slug === slug);
    rows.sort((a, b) => Number(a.archived) - Number(b.archived) || b.versionAt.getTime() - a.versionAt.getTime());
    return rows[0] ? { ...rows[0] } : null;
  }
}

/** Serialised in-memory transactions: each run works on a copy committed only on success (rollback on throw). */
export class InMemoryUnitOfWork extends UnitOfWork {
  db: Db = empty();
  runs = 0;
  /** Makes the next N transactions fail before committing (simulates a database outage). */
  failNext = 0;
  private queue: Promise<unknown> = Promise.resolve();

  run<T>(work: (tx: NotificationTransaction) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      this.runs++;
      const draft = clone(this.db);
      const tx: NotificationTransaction = {
        deliveries: new Deliveries(draft),
        subscriptions: new Subscriptions(draft),
        contacts: new Contacts(draft),
        alerts: new Alerts(draft),
        orders: new Orders(draft),
        products: new Products(draft),
        publish: async (events) => void draft.outboxEvents.push(...events),
        enqueueEmail: async (request) => void draft.outboxEmails.push(structuredClone(request)),
        claim: async (consumer, messageId) => {
          const key = `${consumer}:${messageId}`;
          if (draft.inbox.has(key)) return false;
          draft.inbox.add(key);
          return true;
        },
      };
      const result = await work(tx);
      if (this.failNext > 0) {
        this.failNext--;
        throw new Error("simulated database failure");
      }
      this.db = draft;
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  delivery(dedupeKey: string) {
    return [...this.db.deliveries.values()].find((d) => d.dedupeKey === dedupeKey);
  }

  emails(template?: EmailTemplate) {
    return this.db.outboxEmails.filter((e) => !template || e.template === template);
  }

  events(name?: NotificationEvent["name"]) {
    return this.db.outboxEvents.filter((e) => !name || e.name === name);
  }
}

export class FakeMailer extends Mailer {
  sent: OutgoingEmail[] = [];
  failures: Error[] = [];
  onSend?: () => Promise<void>;

  async send(email: OutgoingEmail): Promise<MailReceipt> {
    await this.onSend?.();
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.sent.push(email);
    return { messageId: `<${this.sent.length}@fake>` };
  }
}

/** Renders a deterministic subject/body from the data; `invalid: true` in data simulates a schema violation. */
export class FakeRenderer extends EmailRenderer {
  constructor(private readonly error?: (template: EmailTemplate) => Error | undefined) {
    super();
  }
  render(template: EmailTemplate, data: Record<string, unknown>): RenderedEmail {
    const error = this.error?.(template);
    if (error) throw error;
    return { subject: `[Meridian sandbox] ${template}`, html: `<p>${JSON.stringify(data)}</p>`, text: JSON.stringify(data) };
  }
}

export class SequentialIds extends IdGenerator {
  private n = 0;
  next(prefix: string) {
    return `${prefix}_${++this.n}`;
  }
}

export class TestLinks extends SiteLinks {
  orderUrl(orderId: string, customer: { userId: string | null }) {
    return `http://site.test/orders/${orderId}${customer.userId ? "" : "?access=guest-token"}`;
  }
  productUrl(slug: string) {
    return `http://site.test/product/${slug}`;
  }
  reviewUrl(slug: string) {
    return `http://site.test/product/${slug}#reviews`;
  }
  newsletterConfirmUrl(token: string) {
    return `http://site.test/newsletter/confirm?token=${token}`;
  }
  newsletterUnsubscribeUrl(token: string) {
    return `http://site.test/newsletter/unsubscribe?token=${token}`;
  }
}

export const testSettings: NotificationSettings = { publicSiteUrl: "http://site.test", supportEmail: "support@meridian.local", sendLeaseMs: 45_000 };

export function tokenFrom(url: string): string {
  return new URL(url).searchParams.get("token")!;
}
