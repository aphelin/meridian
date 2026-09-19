import type { OrderLinks } from "../../domain";

export interface NotificationSettings {
  /** Storefront origin used in every link, without trailing slash. */
  publicSiteUrl: string;
  /** Internal support mailbox receiving contact-form messages. */
  supportEmail: string;
  /** How long one send attempt holds the delivery lease (must exceed the SMTP breaker timeout). */
  sendLeaseMs: number;
}

export const NOTIFICATION_SETTINGS = Symbol("NOTIFICATION_SETTINGS");

/** Site links, including guest order links with the order access token. */
export abstract class SiteLinks implements OrderLinks {
  abstract orderUrl(orderId: string, customer: { userId: string | null }): string;
  abstract productUrl(slug: string): string;
  abstract reviewUrl(slug: string): string;
  abstract newsletterConfirmUrl(token: string): string;
  abstract newsletterUnsubscribeUrl(token: string): string;
}
