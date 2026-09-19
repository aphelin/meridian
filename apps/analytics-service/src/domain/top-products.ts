import { ensure } from "@meridian/kernel";

export interface ProductSalesRow {
  sku: string;
  slug: string;
  productName: string;
  units: number;
  revenueCents: number;
}

export interface RankedProduct {
  /** Best-selling variant SKU of the product in the window. */
  sku: string;
  slug: string;
  productName: string;
  units: number;
  revenueCents: number;
}

export const MAX_TOP_PRODUCTS = 50;

/**
 * Ranks products (by slug, all variants together) by paid revenue, then units, then slug. Rows are per day and SKU;
 * the representative SKU is the variant with the most units (then revenue, then SKU order).
 */
export function rankTopProducts(rows: readonly ProductSalesRow[], limit: number): RankedProduct[] {
  ensure(Number.isInteger(limit) && limit >= 1 && limit <= MAX_TOP_PRODUCTS, "VALIDATION_FAILED", `limit must be between 1 and ${MAX_TOP_PRODUCTS}`);
  const products = new Map<string, { slug: string; productName: string; units: number; revenueCents: number; variants: Map<string, { units: number; revenueCents: number }> }>();
  for (const row of rows) {
    const product = products.get(row.slug) ?? { slug: row.slug, productName: row.productName, units: 0, revenueCents: 0, variants: new Map() };
    product.units += row.units;
    product.revenueCents += row.revenueCents;
    const variant = product.variants.get(row.sku) ?? { units: 0, revenueCents: 0 };
    variant.units += row.units;
    variant.revenueCents += row.revenueCents;
    product.variants.set(row.sku, variant);
    products.set(row.slug, product);
  }
  return [...products.values()]
    .map((product) => {
      const [sku] = [...product.variants.entries()].sort(([skuA, a], [skuB, b]) => b.units - a.units || b.revenueCents - a.revenueCents || skuA.localeCompare(skuB))[0];
      return { sku, slug: product.slug, productName: product.productName, units: product.units, revenueCents: product.revenueCents };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents || b.units - a.units || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}
