import type { OrderActivity, ProjectionDelta } from "../../domain";

/** Operations available inside one projection transaction. */
export interface ProjectionTransaction {
  /** Loads (creating when missing) and row-locks the order's activity until the transaction ends. */
  lockOrder(orderId: string): Promise<OrderActivity>;
  saveOrder(activity: OrderActivity): Promise<void>;
  /** Adds the delta with atomic increments (safe under concurrent projections of other orders). */
  applyDelta(delta: ProjectionDelta): Promise<void>;
  /** Advances the projector's last event time (never backwards) and its event counter. */
  recordEvent(occurredAt: Date): Promise<void>;
}

/**
 * Runs projection work exactly once per message: the Inbox row `(messageId, consumer)` and every read-model change
 * commit or roll back together. Resolves false (without running `work`) for a message already projected.
 */
export abstract class ProjectionUnitOfWork {
  abstract once(consumer: string, messageId: string, work: (tx: ProjectionTransaction) => Promise<void>): Promise<boolean>;
  /** Empties the read model and forgets which messages the consumer projected, atomically. */
  abstract truncate(consumer: string): Promise<void>;
}
