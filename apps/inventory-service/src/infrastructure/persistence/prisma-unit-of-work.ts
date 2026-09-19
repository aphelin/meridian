import { Inbox, OutboxWriter } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import type { InventoryTransaction } from "../../application/ports";
import { UnitOfWork } from "../../application/ports";
import type { InventoryEvent } from "../../domain";
import type { Prisma } from "../../generated/prisma";
import { PrismaService } from "../prisma.service";
import { PrismaReservationRepository } from "./prisma-reservation.repository";
import { PrismaStockItemRepository } from "./prisma-stock-item.repository";

/** Interactive Prisma transaction (READ COMMITTED + explicit row/advisory locks) exposing tx-bound repositories. */
@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
  ) {
    super();
  }

  run<T>(work: (tx: InventoryTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(this.bind(tx)), { maxWait: 5_000, timeout: 15_000 });
  }

  private bind(tx: Prisma.TransactionClient): InventoryTransaction {
    const outbox = this.outbox;
    return {
      stock: new PrismaStockItemRepository(tx),
      reservations: new PrismaReservationRepository(tx),
      async publish(events: readonly InventoryEvent[]) {
        for (const event of events) {
          await outbox.event(tx, event.name, { type: event.aggregateType, id: event.aggregateId }, event.payload);
        }
      },
      claim(consumer: string, messageId: string) {
        return Inbox.once(tx, consumer, messageId, () => undefined);
      },
    };
  }
}
