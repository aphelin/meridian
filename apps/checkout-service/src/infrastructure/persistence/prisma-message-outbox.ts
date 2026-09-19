import type { CommandName, CommandPayloads, EventName, EventPayloads } from "@meridian/contracts";
import { Inbox, OutboxWriter, type PrismaTx } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { type AggregateRef, MessageOutbox } from "../../application/ports";
import type { ContractEvent, TransactionContext } from "../../domain";
import { PrismaService } from "./prisma.service";

const asTx = (tx: TransactionContext) => tx as unknown as PrismaTx;

/** Transactional outbox (kit OutboxWriter) and inbox (kit Inbox) on the checkout database. */
@Injectable()
export class PrismaMessageOutbox extends MessageOutbox {
  constructor(
    private readonly writer: OutboxWriter,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async events(tx: TransactionContext, events: readonly ContractEvent[]): Promise<void> {
    for (const event of events) {
      await this.writer.event(asTx(tx), event.name as EventName, { type: event.aggregateType, id: event.aggregateId }, event.payload as EventPayloads[EventName]);
    }
  }

  command<N extends CommandName>(tx: TransactionContext, name: N, payload: CommandPayloads[N], aggregate?: AggregateRef): Promise<string> {
    return this.writer.command(asTx(tx), name, payload, aggregate ? { aggregate } : undefined);
  }

  once(tx: TransactionContext, consumer: string, messageId: string, work: () => Promise<unknown>): Promise<boolean> {
    return Inbox.once(asTx(tx), consumer, messageId, work);
  }

  async wasProcessed(consumer: string, messageId: string): Promise<boolean> {
    return (await this.prisma.inbox.count({ where: { consumer, messageId } })) > 0;
  }
}
