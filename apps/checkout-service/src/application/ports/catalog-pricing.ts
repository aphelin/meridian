/** One SKU as priced by catalog-service `GET /prices`. */
export interface CatalogPrice {
  sku: string;
  slug: string;
  productName: string;
  variantLabel: string;
  variantId: string;
  priceCents: number;
  status: string;
  /** Catalog stop-sell flag (amendment 1p); pricing refuses the line with OUT_OF_STOCK when true. */
  soldOut: boolean;
}

export abstract class CatalogPricing {
  /** Current prices for the SKUs; unknown SKUs are omitted. */
  abstract pricesFor(skus: string[]): Promise<CatalogPrice[]>;
}
