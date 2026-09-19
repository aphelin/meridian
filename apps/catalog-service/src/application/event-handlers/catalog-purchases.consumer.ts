import { ConsumerGroups, type EventEnvelope } from "@meridian/contracts";
import { KafkaEventHandler, PermanentError } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { ForgetUserCommand, RecordPurchasesCommand } from "../commands/purchases.commands";

const orderDelivered = z.object({
  orderId: z.string().min(1),
  customer: z.object({ userId: z.string().min(1).nullable(), email: z.string(), name: z.string() }),
  lines: z.array(z.object({ sku: z.string(), slug: z.string(), productName: z.string() })),
  deliveredAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "deliveredAt must be an ISO timestamp"),
});

const userDeleted = z.object({ userId: z.string().min(1), email: z.string() });

function parse<T>(schema: z.ZodType<T>, envelope: EventEnvelope): T {
  const result = schema.safeParse(envelope.payload);
  // Retrying never fixes a malformed payload: park it on the group's DLT straight away.
  if (!result.success) throw new PermanentError(`invalid ${envelope.name} payload`, { issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  return result.data;
}

/** Consumer group `catalog-purchases`: verified-purchase facts and account deletion. */
@Injectable()
export class CatalogPurchasesConsumer {
  constructor(private readonly commandBus: CommandBus) {}

  @KafkaEventHandler({ group: ConsumerGroups.catalogPurchases, events: ["OrderDelivered"] })
  async onOrderDelivered(envelope: EventEnvelope): Promise<void> {
    const payload = parse(orderDelivered, envelope);
    // Guest orders cannot be reviewed: there is no account to attach the purchase to.
    if (!payload.customer.userId) return;
    await this.commandBus.execute(
      new RecordPurchasesCommand(envelope.messageId, {
        orderId: payload.orderId,
        userId: payload.customer.userId,
        customerName: payload.customer.name,
        deliveredAt: new Date(payload.deliveredAt),
        slugs: payload.lines.map((l) => l.slug),
      }),
    );
  }

  @KafkaEventHandler({ group: ConsumerGroups.catalogPurchases, events: ["UserDeleted"] })
  async onUserDeleted(envelope: EventEnvelope): Promise<void> {
    const payload = parse(userDeleted, envelope);
    await this.commandBus.execute(new ForgetUserCommand(envelope.messageId, payload.userId));
  }
}
