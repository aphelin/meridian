import { ConsumerGroups, type EventEnvelope } from "@meridian/contracts";
import { DomainError } from "@meridian/kernel";
import { KafkaEventHandler, PermanentError } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { ProjectOrderFactCommand } from "../commands";
import { toOrderFact } from "./order-fact-mapper";

/**
 * Consumer group analytics-projector. Offsets are committed by the kit only after the projection transaction
 * commits (at-least-once); the Inbox makes redeliveries no-ops. Contract violations go straight to the DLT,
 * infrastructure errors are retried.
 */
@Injectable()
export class AnalyticsProjectorConsumer {
  constructor(private readonly commandBus: CommandBus) {}

  @KafkaEventHandler({ group: ConsumerGroups.analyticsProjector, events: ["OrderPlaced", "OrderPaid", "OrderCancelled", "OrderRefunded", "PaymentFailed"] })
  async project(envelope: EventEnvelope): Promise<void> {
    const { messageId, occurredAt, fact } = toOrderFact(envelope);
    try {
      await this.commandBus.execute(new ProjectOrderFactCommand(messageId, fact, occurredAt));
    } catch (error) {
      if (error instanceof DomainError && error.code === "VALIDATION_FAILED") throw new PermanentError(error.message, error.details, { cause: error });
      throw error;
    }
  }
}
