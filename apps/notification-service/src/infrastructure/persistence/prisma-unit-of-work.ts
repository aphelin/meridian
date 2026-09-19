import { Inbox, OutboxWriter } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { UnitOfWork, type NotificationTransaction } from "../../application/ports";
import type { EmailRequest, NotificationEvent } from "../../domain";
import type { Prisma } from "../../generated/prisma";
import { PrismaService } from "../prisma.service";
import {
  PrismaContactMessageRepository,
  PrismaEmailDeliveryRepository,
  PrismaNewsletterSubscriptionRepository,
  PrismaOrderRecipientRepository,
  PrismaProductDirectoryRepository,
  PrismaStockAlertRepository,
} from "./prisma-repositories";

/** Interactive Prisma transaction exposing tx-bound repositories, the outbox and the inbox. */
@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
  ) {
    super();
  }

  run<T>(work: (tx: NotificationTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(this.bind(tx)), { maxWait: 5_000, timeout: 15_000 });
  }

  private bind(tx: Prisma.TransactionClient): NotificationTransaction {
    const outbox = this.outbox;
    return {
      deliveries: new PrismaEmailDeliveryRepository(tx),
      subscriptions: new PrismaNewsletterSubscriptionRepository(tx),
      contacts: new PrismaContactMessageRepository(tx),
      alerts: new PrismaStockAlertRepository(tx),
      orders: new PrismaOrderRecipientRepository(tx),
      products: new PrismaProductDirectoryRepository(tx),
      async publish(events: readonly NotificationEvent[]) {
        for (const event of events) await outbox.event(tx, event.name, { type: event.aggregateType, id: event.aggregateId }, event.payload);
      },
      async enqueueEmail(request: EmailRequest) {
        await outbox.command(tx, "notification.send-email", { template: request.template, to: request.to, data: request.data, dedupeKey: request.dedupeKey });
      },
      claim(consumer: string, messageId: string) {
        return Inbox.once(tx, consumer, messageId, () => undefined);
      },
    };
  }
}
