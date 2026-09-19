import type { CartLineInput } from "@meridian/contracts";
import { ValidationError } from "@meridian/kernel";
import { Injectable } from "@nestjs/common";
import { CatalogOffer, PricedLine } from "../../domain";
import { CatalogPricing } from "../ports";

/** Prices basket lines from the catalog: every SKU must exist, match its variant and be on sale (published, not sold out). */
@Injectable()
export class LinePricer {
  constructor(private readonly catalog: CatalogPricing) {}

  async price(inputs: readonly CartLineInput[]): Promise<PricedLine[]> {
    if (inputs.length === 0) return [];
    const skus = [...new Set(inputs.map((line) => line.sku))];
    const prices = new Map((await this.catalog.pricesFor(skus)).map((price) => [price.sku, price]));
    const unknown = skus.filter((sku) => !prices.has(sku));
    if (unknown.length) throw new ValidationError(`Some items are not in our catalogue: ${unknown.join(", ")}.`, { unknownSkus: unknown });
    return inputs.map((input) => {
      const price = prices.get(input.sku)!;
      if (price.variantId !== input.variantId) {
        throw new ValidationError(`${price.productName} is not available in that variant.`, { sku: input.sku, variantId: input.variantId });
      }
      CatalogOffer.assertPurchasable(price);
      return PricedLine.create({
        sku: price.sku,
        variantId: price.variantId,
        slug: price.slug,
        productName: price.productName,
        variantLabel: price.variantLabel,
        qty: input.qty,
        unitPriceCents: price.priceCents,
      });
    });
  }
}
