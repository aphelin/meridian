import type { OutboxWriter, PrismaTx } from "@meridian/nest-kit";
import { MessageOutbox, type OutboundEvent, type SendEmailPayload } from "../../application/ports";

/** Writes outbox rows through the platform `OutboxWriter` on the unit of work's transaction. */
export class PrismaMessageOutbox extends MessageOutbox {
  constructor(
    private readonly tx: PrismaTx,
    private readonly writer: OutboxWriter,
  ) {
    super();
  }

  async publish(events: readonly OutboundEvent[]): Promise<void> {
    for (const event of events) {
      await this.writer.event(this.tx, event.name, { type: event.aggregateType, id: event.aggregateId }, event.payload as never);
    }
  }

  async sendEmail(payload: SendEmailPayload, aggregate?: { type: string; id: string }): Promise<void> {
    if (!payload.dedupeKey) throw new Error("send-email commands require a dedupeKey");
    await this.writer.command(this.tx, "notification.send-email", payload, aggregate ? { aggregate } : undefined);
  }
}
