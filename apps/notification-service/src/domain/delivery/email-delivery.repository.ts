import type { EmailDelivery } from "./email-delivery";

/** Persistence port for EmailDelivery, bound to one unit of work (transaction). */
export abstract class EmailDeliveryRepository {
  /** Inserts the delivery unless its dedupeKey already exists; returns whether it was inserted. Never overwrites. */
  abstract insertIfMissing(delivery: EmailDelivery): Promise<boolean>;
  /** Locks the row for the rest of the transaction (SELECT … FOR UPDATE) and loads it. */
  abstract lockByDedupeKey(dedupeKey: string): Promise<EmailDelivery | null>;
  abstract save(delivery: EmailDelivery): Promise<void>;
}
