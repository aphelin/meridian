import { orderAccessToken } from "@meridian/nest-kit";
import { Inject, Injectable } from "@nestjs/common";
import { NOTIFICATION_SETTINGS, SiteLinks, type NotificationSettings } from "../../application/ports";

/** Storefront links. Guest order links carry `?access=<orderAccessToken>` computed here, so no secret rides on Kafka. */
@Injectable()
export class StorefrontLinks extends SiteLinks {
  constructor(@Inject(NOTIFICATION_SETTINGS) private readonly settings: NotificationSettings) {
    super();
  }

  private url(path: string, query?: Record<string, string>): string {
    const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
    return `${this.settings.publicSiteUrl}${path}${qs}`;
  }

  orderUrl(orderId: string, customer: { userId: string | null }): string {
    const path = `/orders/${encodeURIComponent(orderId)}`;
    return customer.userId ? this.url(path) : this.url(path, { access: orderAccessToken(orderId) });
  }

  productUrl(slug: string): string {
    return this.url(`/product/${encodeURIComponent(slug)}`);
  }

  reviewUrl(slug: string): string {
    return `${this.productUrl(slug)}#reviews`;
  }

  newsletterConfirmUrl(token: string): string {
    return this.url("/newsletter/confirm", { token });
  }

  newsletterUnsubscribeUrl(token: string): string {
    return this.url("/newsletter/unsubscribe", { token });
  }
}
