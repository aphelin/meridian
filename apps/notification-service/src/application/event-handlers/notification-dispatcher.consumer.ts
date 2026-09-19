import { ConsumerGroups, type EventEnvelope, type EventPayloads } from "@meridian/contracts";
import { KafkaEventHandler, PermanentError } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { assertSlug, ORDER_EMAIL_EVENTS, type OrderEmailEvent, type OrderEmailEventName, type ProductDirectoryChange } from "../../domain";
import { DispatchOrderEmailCommand, ForgetCustomerCommand, NotifyStockAlertsCommand, ProjectProductCommand, RecordOrderRecipientCommand } from "../commands";
import { asPermanentOnRuleViolation, parsePayload } from "./message-errors";

const id = z.string().min(1).max(200);
const cents = z.number().int();
const text = (max: number) => z.string().max(max);

const header = z.object({
  orderId: id,
  number: text(40).min(1),
  customer: z.object({ userId: id.nullable(), email: z.string().min(3).max(254), name: text(200) }),
});
const line = z.object({ sku: text(64), slug: text(120), productName: text(200), variantLabel: text(200), qty: z.number().int(), unitPriceCents: cents, lineTotalCents: cents });
const pricing = z.object({ subtotalCents: cents, discountCents: cents, shippingCents: cents, taxCents: cents, taxRatePercent: z.number(), totalCents: cents, currency: z.literal("EUR") });
const address = z.object({ fullName: text(200), line1: text(200), line2: text(200).nullable(), city: text(120), postalCode: text(20), country: text(2), phone: text(40).nullable() });
const skuQty = z.object({ sku: text(64), qty: z.number().int() });

/** Validates only what the emails use; unknown extra fields are dropped (events may grow). */
const orderSchemas: { [N in OrderEmailEventName]: z.ZodType<EventPayloads[N], unknown> } = {
  OrderPaid: header.extend({ lines: z.array(line).max(200), pricing, paymentId: id, paidAt: z.string() }),
  OrderShipped: header.extend({ carrier: text(80), trackingNumber: text(120).min(1), trackingUrl: text(2000), shippedAt: z.string() }),
  OrderDelivered: header.extend({ lines: z.array(line.pick({ sku: true, slug: true, productName: true })).max(200), deliveredAt: z.string() }),
  OrderCancelled: header.extend({ reason: z.enum(["customer", "admin", "expired", "out-of-stock", "payment-unavailable"]), refundRequired: z.boolean(), totalCents: cents, cancelledAt: z.string() }),
  OrderRefunded: header.extend({ refundId: id, amountCents: cents, totalRefundedCents: cents, full: z.boolean(), reason: text(500) }),
  ReturnRequested: header.extend({ returnId: id, lines: z.array(skuQty).max(200), reason: text(2000) }),
  ReturnApproved: header.extend({ returnId: id, lines: z.array(skuQty).max(200), refundCents: cents, restock: z.boolean() }),
  ReturnRejected: header.extend({ returnId: id, note: text(2000) }),
  InvoiceIssued: header.extend({ invoiceNumber: text(60).min(1), totalCents: cents, issuedAt: z.string() }),
};

const orderPlaced = header.extend({ shippingAddress: address });
const stockReplenished = z.object({ sku: text(64).min(1), available: z.number().int() });
const userDeleted = z.object({ userId: id, email: z.string().min(3).max(254) });
const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "must be an ISO date-time");
const slug = z.string().min(1).max(120);
const productSnapshot = z.object({
  product: z.object({
    productId: id,
    slug,
    name: text(200).trim().min(1),
    heroImageUrl: text(2000).nullish(),
    status: z.enum(["draft", "published", "archived"]),
    updatedAt: timestamp,
  }),
});
const productArchived = z.object({ productId: id.optional(), slug });

const GROUP = ConsumerGroups.notificationDispatcher;

/**
 * Consumer group `notification-dispatcher`: turns order, stock and identity facts from Kafka into
 * `notification.send-email` commands (through the outbox, idempotent per message and per business key).
 */
@Injectable()
export class NotificationDispatcherConsumer {
  constructor(private readonly commandBus: CommandBus) {}

  @KafkaEventHandler({ group: GROUP, events: ["OrderPlaced"] })
  async onOrderPlaced(envelope: EventEnvelope): Promise<void> {
    const payload = parsePayload(orderPlaced, envelope.payload, envelope.name) as unknown as EventPayloads["OrderPlaced"];
    await asPermanentOnRuleViolation(() => this.commandBus.execute(new RecordOrderRecipientCommand(payload, envelope.messageId)));
  }

  @KafkaEventHandler({ group: GROUP, events: [...ORDER_EMAIL_EVENTS] })
  async onOrderEvent(envelope: EventEnvelope): Promise<void> {
    const name = envelope.name as OrderEmailEventName;
    const schema = orderSchemas[name];
    if (!schema) return;
    const event = { name, payload: parsePayload(schema, envelope.payload, envelope.name) } as OrderEmailEvent;
    await asPermanentOnRuleViolation(() => this.commandBus.execute(new DispatchOrderEmailCommand(event, envelope.messageId)));
  }

  @KafkaEventHandler({ group: GROUP, events: ["StockReplenished"] })
  async onStockReplenished(envelope: EventEnvelope): Promise<void> {
    const { sku } = parsePayload(stockReplenished, envelope.payload, envelope.name);
    await asPermanentOnRuleViolation(() => this.commandBus.execute(new NotifyStockAlertsCommand(sku, envelope.messageId)));
  }

  @KafkaEventHandler({ group: GROUP, events: ["ProductPublished", "ProductUpdated", "ProductArchived"] })
  async onProductEvent(envelope: EventEnvelope): Promise<void> {
    await asPermanentOnRuleViolation(() => this.commandBus.execute(new ProjectProductCommand(productChange(envelope), envelope.messageId)));
  }

  @KafkaEventHandler({ group: GROUP, events: ["UserDeleted"] })
  async onUserDeleted(envelope: EventEnvelope): Promise<void> {
    const { userId, email } = parsePayload(userDeleted, envelope.payload, envelope.name);
    await asPermanentOnRuleViolation(() => this.commandBus.execute(new ForgetCustomerCommand(userId, email, envelope.messageId)));
  }
}

/** Maps a catalog event to a directory change; malformed payloads are permanent failures. */
export function productChange(envelope: EventEnvelope): ProductDirectoryChange {
  if (envelope.name === "ProductArchived") {
    const payload = parsePayload(productArchived, envelope.payload, envelope.name);
    const productId = payload.productId ?? envelope.aggregateId;
    const versionAt = new Date(envelope.occurredAt);
    if (!productId || Number.isNaN(versionAt.getTime())) throw new PermanentError("Invalid ProductArchived envelope", { productId, occurredAt: envelope.occurredAt });
    return { kind: "archived", productId, slug: assertSlug(payload.slug), versionAt };
  }
  const { product } = parsePayload(productSnapshot, envelope.payload, envelope.name);
  return {
    kind: "snapshot",
    productId: product.productId,
    slug: assertSlug(product.slug),
    name: product.name,
    heroImageUrl: product.heroImageUrl ?? null,
    archived: product.status === "archived",
    versionAt: new Date(product.updatedAt),
  };
}
