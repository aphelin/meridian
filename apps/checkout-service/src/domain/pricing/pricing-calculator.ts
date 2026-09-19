import type { OrderLineSnapshot, PricingBreakdown, ShippingMethodId } from "@meridian/contracts";
import { ensure, Money } from "@meridian/kernel";
import type { PricedLine } from "./priced-line";
import { type ShippingPolicies, type ShippingQuote } from "./shipping-policy";
import { TaxPolicy } from "./tax-policy";

export interface PricingInput {
  lines: PricedLine[];
  shippingMethod: ShippingMethodId;
  country: string;
  /** Computes the discount for the basket subtotal; absent when no coupon applies. */
  discount?: (subtotal: Money) => Money;
}

export interface PricedBasket {
  lines: OrderLineSnapshot[];
  pricing: PricingBreakdown;
  shippingOptions: ShippingQuote[];
}

/**
 * Domain service composing the pricing policies: subtotal → coupon discount → shipping strategy on the discounted
 * subtotal → VAT contained in the total at the destination rate.
 */
export class PricingCalculator {
  constructor(
    private readonly shipping: ShippingPolicies,
    private readonly tax: TaxPolicy,
  ) {}

  price(input: PricingInput): PricedBasket {
    const subtotal = Money.sum(input.lines.map((line) => line.lineTotal));
    const discount = input.discount ? input.discount(subtotal) : Money.zero();
    ensure(!discount.isNegative() && subtotal.greaterThanOrEqual(discount), "VALIDATION_FAILED", "A discount cannot exceed the basket.");
    const afterDiscount = subtotal.subtract(discount);
    const method = this.shipping.get(input.shippingMethod);
    const shipping = method.priceFor(afterDiscount);
    const total = afterDiscount.add(shipping);
    const { ratePercent, tax } = this.tax.assess(total, input.country);
    return {
      lines: input.lines.map((line) => line.toSnapshot()),
      pricing: {
        subtotalCents: subtotal.cents,
        discountCents: discount.cents,
        shippingCents: shipping.cents,
        taxCents: tax.cents,
        taxRatePercent: ratePercent,
        totalCents: total.cents,
        currency: "EUR",
      },
      shippingOptions: this.shipping.quoteAll(afterDiscount),
    };
  }
}

/** Invariant of every stored breakdown: total = subtotal − discount + shipping, all non-negative. */
export function assertConsistentPricing(pricing: PricingBreakdown, lines: OrderLineSnapshot[]): void {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  ensure(pricing.subtotalCents === subtotal, "VALIDATION_FAILED", "Pricing subtotal does not match the lines.");
  ensure(pricing.discountCents >= 0 && pricing.discountCents <= pricing.subtotalCents, "VALIDATION_FAILED", "Invalid discount.");
  ensure(pricing.shippingCents >= 0 && pricing.taxCents >= 0, "VALIDATION_FAILED", "Invalid shipping or tax.");
  ensure(pricing.totalCents === pricing.subtotalCents - pricing.discountCents + pricing.shippingCents, "VALIDATION_FAILED", "Pricing total is inconsistent.");
}
