import type { OrderFact } from "../../domain";

/** Folds one order fact, delivered as Kafka message `messageId`, into the analytics read model (once). */
export class ProjectOrderFactCommand {
  constructor(
    readonly messageId: string,
    readonly fact: OrderFact,
    /** Envelope occurredAt: drives the projection's last event time. */
    readonly occurredAt: Date,
  ) {}
}
