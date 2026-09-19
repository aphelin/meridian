import type { EmailTemplate, PostalAddress } from "@meridian/contracts";
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
  type DeliveryStatus,
  type OrderRecipient,
  type ProductDirectoryEntry,
  type StockAlertStatus,
  type SubscriptionStatus,
} from "../../domain";
import type { Prisma } from "../../generated/prisma";

type Tx = Prisma.TransactionClient;

interface DeliveryRow {
  id: string;
  dedupeKey: string;
  template: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  status: string;
  attempts: number;
  lastError: string | null;
  correlationId: string;
  leaseUntil: Date | null;
  smtpMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

const toDelivery = (row: DeliveryRow) => EmailDelivery.restore({ ...row, template: row.template as EmailTemplate, status: row.status as DeliveryStatus });

export class PrismaEmailDeliveryRepository extends EmailDeliveryRepository {
  constructor(private readonly tx: Tx) {
    super();
  }

  async insertIfMissing(delivery: EmailDelivery): Promise<boolean> {
    const s = delivery.snapshot();
    const inserted = await this.tx.$executeRaw`
      INSERT INTO "EmailDelivery" ("id", "dedupeKey", "template", "toEmail", "toName", "subject", "status", "attempts", "lastError", "correlationId", "leaseUntil", "smtpMessageId", "createdAt", "updatedAt", "sentAt")
      VALUES (${s.id}, ${s.dedupeKey}, ${s.template}, ${s.toEmail}, ${s.toName}, ${s.subject}, ${s.status}, ${s.attempts}, ${s.lastError}, ${s.correlationId}, ${s.leaseUntil}, ${s.smtpMessageId}, ${s.createdAt}, ${s.updatedAt}, ${s.sentAt})
      ON CONFLICT ("dedupeKey") DO NOTHING`;
    return inserted > 0;
  }

  async lockByDedupeKey(dedupeKey: string): Promise<EmailDelivery | null> {
    const rows = await this.tx.$queryRaw<DeliveryRow[]>`SELECT * FROM "EmailDelivery" WHERE "dedupeKey" = ${dedupeKey} FOR UPDATE`;
    return rows[0] ? toDelivery(rows[0]) : null;
  }

  async save(delivery: EmailDelivery): Promise<void> {
    const s = delivery.snapshot();
    await this.tx.emailDelivery.update({
      where: { id: s.id },
      data: { subject: s.subject, status: s.status, attempts: s.attempts, lastError: s.lastError, leaseUntil: s.leaseUntil, smtpMessageId: s.smtpMessageId, updatedAt: s.updatedAt, sentAt: s.sentAt },
    });
  }
}

interface SubscriptionRow {
  id: string;
  email: string;
  status: string;
  confirmTokenHash: string | null;
  confirmTokenExpiresAt: Date | null;
  unsubscribeTokenHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
}

const toSubscription = (row: SubscriptionRow | undefined) => (row ? NewsletterSubscription.restore({ ...row, status: row.status as SubscriptionStatus }) : null);

export class PrismaNewsletterSubscriptionRepository extends NewsletterSubscriptionRepository {
  constructor(private readonly tx: Tx) {
    super();
  }

  async insertIfMissing(subscription: NewsletterSubscription): Promise<boolean> {
    const s = subscription.snapshot();
    const inserted = await this.tx.$executeRaw`
      INSERT INTO "NewsletterSubscription" ("id", "email", "status", "confirmTokenHash", "confirmTokenExpiresAt", "unsubscribeTokenHash", "createdAt", "updatedAt", "confirmedAt", "unsubscribedAt")
      VALUES (${s.id}, ${s.email}, ${s.status}, ${s.confirmTokenHash}, ${s.confirmTokenExpiresAt}, ${s.unsubscribeTokenHash}, ${s.createdAt}, ${s.updatedAt}, ${s.confirmedAt}, ${s.unsubscribedAt})
      ON CONFLICT ("email") DO NOTHING`;
    return inserted > 0;
  }

  async lockByEmail(email: string) {
    return toSubscription((await this.tx.$queryRaw<SubscriptionRow[]>`SELECT * FROM "NewsletterSubscription" WHERE "email" = ${email} FOR UPDATE`)[0]);
  }

  async lockByConfirmTokenHash(hash: string) {
    return toSubscription((await this.tx.$queryRaw<SubscriptionRow[]>`SELECT * FROM "NewsletterSubscription" WHERE "confirmTokenHash" = ${hash} FOR UPDATE`)[0]);
  }

  async lockByUnsubscribeTokenHash(hash: string) {
    return toSubscription((await this.tx.$queryRaw<SubscriptionRow[]>`SELECT * FROM "NewsletterSubscription" WHERE "unsubscribeTokenHash" = ${hash} FOR UPDATE`)[0]);
  }

  async save(subscription: NewsletterSubscription): Promise<void> {
    const s = subscription.snapshot();
    await this.tx.newsletterSubscription.update({
      where: { id: s.id },
      data: {
        status: s.status,
        confirmTokenHash: s.confirmTokenHash,
        confirmTokenExpiresAt: s.confirmTokenExpiresAt,
        unsubscribeTokenHash: s.unsubscribeTokenHash,
        updatedAt: s.updatedAt,
        confirmedAt: s.confirmedAt,
        unsubscribedAt: s.unsubscribedAt,
      },
    });
  }
}

export class PrismaContactMessageRepository extends ContactMessageRepository {
  constructor(private readonly tx: Tx) {
    super();
  }

  async add(message: ContactMessage): Promise<void> {
    const s = message.snapshot();
    await this.tx.contactMessage.create({ data: { ...s } });
  }
}

interface AlertRow {
  id: string;
  email: string;
  sku: string;
  slug: string;
  status: string;
  createdAt: Date;
  notifiedAt: Date | null;
}

export class PrismaStockAlertRepository extends StockAlertRepository {
  constructor(private readonly tx: Tx) {
    super();
  }

  async insertIfNoPending(alert: StockAlert): Promise<boolean> {
    const s = alert.snapshot();
    const inserted = await this.tx.$executeRaw`
      INSERT INTO "StockAlert" ("id", "email", "sku", "slug", "status", "pendingKey", "createdAt", "notifiedAt")
      VALUES (${s.id}, ${s.email}, ${s.sku}, ${s.slug}, ${s.status}, ${alert.pendingKey}, ${s.createdAt}, ${s.notifiedAt})
      ON CONFLICT ("pendingKey") DO NOTHING`;
    return inserted > 0;
  }

  async lockPendingForSku(sku: string, limit: number): Promise<StockAlert[]> {
    const rows = await this.tx.$queryRaw<AlertRow[]>`
      SELECT "id", "email", "sku", "slug", "status", "createdAt", "notifiedAt" FROM "StockAlert"
      WHERE "sku" = ${sku} AND "status" = 'pending'
      ORDER BY "createdAt", "id" LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
    return rows.map((row) => StockAlert.restore({ ...row, status: row.status as StockAlertStatus }));
  }

  async save(alert: StockAlert): Promise<void> {
    const s = alert.snapshot();
    await this.tx.stockAlert.update({ where: { id: s.id }, data: { status: s.status, pendingKey: alert.pendingKey, notifiedAt: s.notifiedAt } });
  }

  async deleteByEmail(email: string): Promise<number> {
    return (await this.tx.stockAlert.deleteMany({ where: { email } })).count;
  }
}

export class PrismaOrderRecipientRepository extends OrderRecipientRepository {
  constructor(private readonly tx: Tx) {
    super();
  }

  async remember(recipient: OrderRecipient, now: Date): Promise<void> {
    const address = JSON.stringify(recipient.shippingAddress);
    await this.tx.$executeRaw`
      INSERT INTO "OrderRecipient" ("orderId", "number", "userId", "email", "name", "shippingAddress", "createdAt")
      VALUES (${recipient.orderId}, ${recipient.number}, ${recipient.customer.userId}, ${recipient.customer.email}, ${recipient.customer.name}, ${address}::jsonb, ${now})
      ON CONFLICT ("orderId") DO NOTHING`;
  }

  async find(orderId: string): Promise<OrderRecipient | null> {
    const row = await this.tx.orderRecipient.findUnique({ where: { orderId } });
    if (!row) return null;
    return { orderId: row.orderId, number: row.number, customer: { userId: row.userId, email: row.email, name: row.name }, shippingAddress: row.shippingAddress as unknown as PostalAddress };
  }

  async forgetCustomer(userId: string, email: string): Promise<number> {
    return (await this.tx.orderRecipient.deleteMany({ where: { OR: [{ userId }, { email: { equals: email, mode: "insensitive" } }] } })).count;
  }
}

export class PrismaProductDirectoryRepository extends ProductDirectoryRepository {
  constructor(private readonly tx: Tx) {
    super();
  }

  async lock(productId: string): Promise<ProductDirectoryEntry | null> {
    // A transaction-scoped advisory lock also covers the product's first insert (no row to lock FOR UPDATE yet), so the
    // live topic and the replay topic cannot interleave read-merge-write for the same product.
    await this.tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`product-directory:${productId}`}, 0))::text AS locked`;
    return this.tx.productDirectoryEntry.findUnique({ where: { productId }, select: ENTRY });
  }

  async save(entry: ProductDirectoryEntry): Promise<void> {
    const data = { slug: entry.slug, name: entry.name, heroImageUrl: entry.heroImageUrl, archived: entry.archived, versionAt: entry.versionAt };
    await this.tx.productDirectoryEntry.upsert({ where: { productId: entry.productId }, create: { productId: entry.productId, ...data }, update: data });
  }

  async findBySlug(slug: string): Promise<ProductDirectoryEntry | null> {
    return this.tx.productDirectoryEntry.findFirst({ where: { slug }, orderBy: [{ archived: "asc" }, { versionAt: "desc" }], select: ENTRY });
  }
}

const ENTRY = { productId: true, slug: true, name: true, heroImageUrl: true, archived: true, versionAt: true } as const;
