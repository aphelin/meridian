import type { EventEnvelope } from "@meridian/contracts";
import { KafkaEventHandler, type KafkaHandlerMeta, PermanentError } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { AnonymiseCustomerCommand, CHECKOUT_IDENTITY_GROUP } from "../commands";

/** Kafka consumer group `checkout-identity`: reacts to identity events. */
@Injectable()
export class IdentityEventsConsumer {
  constructor(private readonly commandBus: CommandBus) {}

  @KafkaEventHandler({ group: CHECKOUT_IDENTITY_GROUP, events: ["UserDeleted"] })
  async onUserDeleted(envelope: EventEnvelope, _meta: KafkaHandlerMeta): Promise<void> {
    if (envelope.name !== "UserDeleted") return;
    const userId = (envelope.payload as { userId?: unknown }).userId;
    if (typeof userId !== "string" || !userId) throw new PermanentError("UserDeleted without userId");
    await this.commandBus.execute(new AnonymiseCustomerCommand(envelope.messageId, userId));
  }
}
