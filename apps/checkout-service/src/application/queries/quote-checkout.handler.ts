import type { CartLineInput, QuoteDto } from "@meridian/contracts";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Coupon } from "../../domain";
import { CartResolver, CheckoutPricing } from "../services";
import { QuoteCheckoutQuery } from "./quote-checkout.query";

/** Prices a basket for a destination and shipping method. Coupon problems never fail the quote; they are reported. */
@QueryHandler(QuoteCheckoutQuery)
export class QuoteCheckoutHandler implements IQueryHandler<QuoteCheckoutQuery, QuoteDto> {
  constructor(
    private readonly pricing: CheckoutPricing,
    private readonly resolver: CartResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ request, userId, cartId }: QuoteCheckoutQuery): Promise<QuoteDto> {
    const lines: CartLineInput[] = request.lines ?? ((await this.resolver.existing(userId, cartId))?.lines.map(({ sku, variantId, qty }) => ({ sku, variantId, qty })) ?? []);
    const quote = await this.pricing.quote({
      lines,
      shippingMethod: request.shippingMethod,
      country: request.country,
      couponCode: request.couponCode ?? null,
      // Amendment 1j: once-per-customer is only previewed for signed-in callers (by user id). A guest email is never
      // used to look up redemptions here, so quotes cannot reveal whether an address used a coupon; PlaceOrder enforces it.
      customerKey: userId ? Coupon.customerKey(userId, null) : null,
      now: this.clock.now(),
    });
    return {
      lines: quote.basket.lines,
      pricing: quote.basket.pricing,
      shippingOptions: quote.basket.shippingOptions.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description,
        priceCents: option.price.cents,
        etaDays: option.etaDays,
      })),
      coupon:
        quote.couponCode && quote.verdict
          ? {
              code: quote.couponCode,
              applied: quote.verdict.satisfied,
              message: quote.verdict.message,
              discountCents: quote.verdict.satisfied ? quote.basket.pricing.discountCents : 0,
            }
          : null,
    };
  }
}
