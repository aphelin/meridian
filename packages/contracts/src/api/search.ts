import type { Cents, ColorFamily } from "../common";

export type SearchSort = "relevance" | "featured" | "newest" | "price-asc" | "price-desc" | "name";

export interface SearchQuery {
  q?: string;
  category?: string;
  materials?: string[];
  colors?: ColorFamily[];
  minPriceCents?: number;
  maxPriceCents?: number;
  inStock?: boolean;
  sort?: SearchSort;
  limit?: number;
  cursor?: string;
}

export interface SearchHitDto {
  productId: string;
  slug: string;
  name: string;
  kind: string;
  categoryId: string;
  priceCents: Cents;
  heroImageUrl: string;
  inStock: boolean;
  featured: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  /** ts_rank or trigram similarity; 0 when no query. */
  score: number;
}

export interface FacetValueDto {
  id: string;
  label: string;
  count: number;
}

export interface SearchResultDto {
  items: SearchHitDto[];
  total: number;
  nextCursor: string | null;
  facets: {
    categories: FacetValueDto[];
    materials: FacetValueDto[];
    colors: FacetValueDto[];
    price: { minCents: Cents; maxCents: Cents } | null;
    inStockCount: number;
  };
  /** Set when the query matched nothing literally but a close spelling did. */
  didYouMean: string | null;
}

export interface SuggestionDto {
  slug: string;
  name: string;
  kind: string;
  heroImageUrl: string;
  priceCents: Cents;
}
