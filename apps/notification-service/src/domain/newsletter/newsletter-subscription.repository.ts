import type { NewsletterSubscription } from "./newsletter-subscription";

/** Persistence port for NewsletterSubscription, bound to one unit of work. Lookups lock the row. */
export abstract class NewsletterSubscriptionRepository {
  /** Inserts unless the email already has a subscription; returns whether it was inserted. */
  abstract insertIfMissing(subscription: NewsletterSubscription): Promise<boolean>;
  abstract lockByEmail(email: string): Promise<NewsletterSubscription | null>;
  abstract lockByConfirmTokenHash(hash: string): Promise<NewsletterSubscription | null>;
  abstract lockByUnsubscribeTokenHash(hash: string): Promise<NewsletterSubscription | null>;
  abstract save(subscription: NewsletterSubscription): Promise<void>;
}
