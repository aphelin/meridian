import type { InventoryEvent, ReservationRepository, StockItemRepository } from "../../domain";

/** Everything a command handler may touch inside one database transaction. */
export interface InventoryTransaction {
  readonly stock: StockItemRepository;
  readonly reservations: ReservationRepository;
  /** Writes the events to the transactional outbox (published to Kafka only if the transaction commits). */
  publish(events: readonly InventoryEvent[]): Promise<void>;
  /** Records (consumer, messageId) in the inbox; false when it was already processed. Rolled back with the transaction. */
  claim(consumer: string, messageId: string): Promise<boolean>;
}

/** Runs `work` atomically: aggregates, movements, outbox rows and inbox marks commit or roll back together. */
export abstract class UnitOfWork {
  abstract run<T>(work: (tx: InventoryTransaction) => Promise<T>): Promise<T>;
}
