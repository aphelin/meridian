import type { CommandEnvelope, EventEnvelope } from "@meridian/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { RequestContext, instanceId } from "../../../src/core";
import { Inbox, KafkaEventHandler, RabbitCommandHandler, type KafkaHandlerMeta, type RabbitHandlerMeta } from "../../../src/messaging";
import { inflight } from "./inflight";
import { PrismaService } from "./prisma.service";

@Injectable()
export class DemoHandlers {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private row(consumer: string, messageId: string, attempt: number) {
    return { consumer, messageId, correlationId: RequestContext.correlationId() ?? "", instanceId: instanceId(), attempt };
  }

  @KafkaEventHandler({ group: "kitfix-a", events: ["StockAdjusted"] })
  async kitfixA(envelope: EventEnvelope, meta: KafkaHandlerMeta): Promise<void> {
    inflight.kafka += 1;
    try {
      await this.prisma.$transaction((tx) =>
        Inbox.once(tx, "kitfix-a", envelope.messageId, () => tx.demoHandled.create({ data: this.row("kitfix-a", envelope.messageId, meta.attempt) })),
      );
    } finally {
      inflight.kafka -= 1;
    }
  }

  @KafkaEventHandler({ group: "kitfix-b", events: ["StockAdjusted"] })
  async kitfixB(envelope: EventEnvelope, meta: KafkaHandlerMeta): Promise<void> {
    inflight.kafka += 1;
    try {
      await this.prisma.demoHandled.create({ data: this.row("kitfix-b", envelope.messageId, meta.attempt) });
    } finally {
      inflight.kafka -= 1;
    }
  }

  @RabbitCommandHandler({ command: "notification.send-email" })
  async sendEmail(envelope: CommandEnvelope, meta: RabbitHandlerMeta): Promise<void> {
    inflight.rabbit += 1;
    try {
      await this.prisma.$transaction((tx) =>
        Inbox.once(tx, "rabbit", envelope.messageId, () => tx.demoHandled.create({ data: this.row("rabbit", envelope.messageId, meta.attempt) })),
      );
    } finally {
      inflight.rabbit -= 1;
    }
  }
}
