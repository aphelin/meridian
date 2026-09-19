import { Inbox, OutboxWriter, type PrismaTx } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { type OutboundMessage, type PaymentTransaction, UnitOfWork } from "../../application/ports";
import type { Prisma } from "../../generated/prisma";
import { PrismaService } from "../prisma.service";
import { PrismaPaymentRepository } from "./prisma-payment.repository";

/** Interactive Prisma transaction exposing a tx-bound repository, the outbox and the inbox. */
@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
  ) {
    super();
  }

  run<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(this.bind(tx)), { maxWait: 5_000, timeout: 15_000 });
  }

  private bind(tx: Prisma.TransactionClient): PaymentTransaction {
    const outbox = this.outbox;
    const raw = tx as unknown as PrismaTx;
    return {
      payments: new PrismaPaymentRepository(tx),
      async write(messages: readonly OutboundMessage[]) {
        for (const message of messages) {
          if (message.kind === "event") await outbox.event(raw, message.name, message.aggregate, message.payload as never);
          else await outbox.command(raw, message.name, message.payload as never, message.aggregate ? { aggregate: message.aggregate } : undefined);
        }
      },
      claim(consumer: string, key: string) {
        return Inbox.once(raw, consumer, key, () => undefined);
      },
    };
  }
}
