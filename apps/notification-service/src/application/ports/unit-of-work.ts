import type {
  ContactMessageRepository,
  EmailDeliveryRepository,
  EmailRequest,
  NewsletterSubscriptionRepository,
  NotificationEvent,
  OrderRecipientRepository,
  ProductDirectoryRepository,
  StockAlertRepository,
} from "../../domain";

/** Everything a command handler may touch inside one database transaction. */
export interface NotificationTransaction {
  readonly deliveries: EmailDeliveryRepository;
  readonly subscriptions: NewsletterSubscriptionRepository;
  readonly contacts: ContactMessageRepository;
  readonly alerts: StockAlertRepository;
  readonly orders: OrderRecipientRepository;
  readonly products: ProductDirectoryRepository;
  /** Writes domain events to the transactional outbox (published to Kafka only if the transaction commits). */
  publish(events: readonly NotificationEvent[]): Promise<void>;
  /**
   * Enqueues a `notification.send-email` command through the outbox. Mail is never sent inside a transaction:
   * the command is delivered by RabbitMQ (with retries and a DLQ) after the transaction commits.
   */
  enqueueEmail(request: EmailRequest): Promise<void>;
  /** Records (consumer, messageId) in the inbox; false when it was already processed. Rolled back with the transaction. */
  claim(consumer: string, messageId: string): Promise<boolean>;
}

/** Runs `work` atomically: aggregates, outbox rows and inbox marks commit or roll back together. */
export abstract class UnitOfWork {
  abstract run<T>(work: (tx: NotificationTransaction) => Promise<T>): Promise<T>;
}
