import type { CartLineInput, ShippingMethodId } from "@meridian/contracts";
import { Money } from "@meridian/kernel";
import { Injectable } from "@nestjs/common";
import { Coupon, CouponRepository, CouponSpecification, type CouponVerdict, type PricedBasket, type PricedLine, PricingCalculator } from "../../domain";
import { LinePricer } from "./line-pricer";

export interface CheckoutQuoteInput {
  lines: readonly CartLineInput[];
  shippingMethod: ShippingMethodId;
  country: string;
  couponCode: string | null;
  customerKey: string | null;
  now: Date;
}

export interface CheckoutQuote {
  pricedLines: PricedLine[];
  basket: PricedBasket;
  /** Normalised coupon code as entered, or null when none was entered. */
  couponCode: string | null;
  coupon: Coupon | null;
  verdict: CouponVerdict | null;
  alreadyUsedByCustomer: boolean;
}

/** Application service shared by the quote query and the place-order saga: catalog prices + pricing policies + coupon. */
@Injectable()
export class CheckoutPricing {
  constructor(
    private readonly linePricer: LinePricer,
    private readonly coupons: CouponRepository,
    private readonly calculator: PricingCalculator,
  ) {}

  async quote(input: CheckoutQuoteInput): Promise<CheckoutQuote> {
    const pricedLines = await this.linePricer.price(input.lines);
    const subtotal = Money.sum(pricedLines.map((line) => line.lineTotal));
    const couponCode = input.couponCode?.trim() ? Coupon.normalizeCode(input.couponCode) : null;
    let coupon: Coupon | null = null;
    let verdict: CouponVerdict | null = null;
    let alreadyUsedByCustomer = false;
    if (couponCode) {
      coupon = await this.coupons.findByCode(couponCode);
      if (coupon?.oncePerCustomer && input.customerKey) alreadyUsedByCustomer = await this.coupons.hasRedemption(coupon.code, input.customerKey);
      verdict = CouponSpecification.evaluate(coupon, { subtotal, now: input.now, customerKey: input.customerKey, alreadyUsedByCustomer });
    }
    const discount = verdict?.satisfied ? verdict.discount : null;
    const basket = this.calculator.price({
      lines: pricedLines,
      shippingMethod: input.shippingMethod,
      country: input.country,
      discount: discount ? () => discount : undefined,
    });
    return { pricedLines, basket, couponCode, coupon, verdict, alreadyUsedByCustomer };
  }
}
