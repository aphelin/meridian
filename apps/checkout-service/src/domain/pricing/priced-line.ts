import type { OrderLineSnapshot } from "@meridian/contracts";
import { ensure, Money } from "@meridian/kernel";

export const MAX_QTY_PER_LINE = 20;

/** A basket line priced from the catalog at the moment of quoting or ordering. Immutable. */
export class PricedLine {
  private constructor(
    readonly sku: string,
    readonly variantId: string,
    readonly slug: string,
    readonly productName: string,
    readonly variantLabel: string,
    readonly qty: number,
    readonly unitPrice: Money,
  ) {}

  static create(input: { sku: string; variantId: string; slug: string; productName: string; variantLabel: string; qty: number; unitPriceCents: number }): PricedLine {
    ensure(input.sku.trim().length > 0, "VALIDATION_FAILED", "A line needs a SKU.");
    ensure(Number.isInteger(input.qty) && input.qty >= 1 && input.qty <= MAX_QTY_PER_LINE, "VALIDATION_FAILED", `Quantity must be between 1 and ${MAX_QTY_PER_LINE}.`, { sku: input.sku, qty: input.qty });
    ensure(Number.isSafeInteger(input.unitPriceCents) && input.unitPriceCents >= 0, "VALIDATION_FAILED", "A price cannot be negative.", { sku: input.sku });
    return new PricedLine(input.sku, input.variantId, input.slug, input.productName, input.variantLabel, input.qty, Money.cents(input.unitPriceCents));
  }

  get lineTotal(): Money {
    return this.unitPrice.multiply(this.qty);
  }

  toSnapshot(): OrderLineSnapshot {
    return {
      sku: this.sku,
      slug: this.slug,
      productName: this.productName,
      variantLabel: this.variantLabel,
      qty: this.qty,
      unitPriceCents: this.unitPrice.cents,
      lineTotalCents: this.lineTotal.cents,
    };
  }
}
