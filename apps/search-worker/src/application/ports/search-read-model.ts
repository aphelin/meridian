import type { SearchCriteria, MatchMode, SortTerm, SortValue } from "../../domain";

/** One result row with everything the DTO and the cursor need. */
export interface SearchHitRow {
  productId: string;
  slug: string;
  name: string;
  kind: string;
  categoryId: string;
  priceCents: number;
  heroImageUrl: string;
  inStock: boolean;
  featured: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  createdAt: Date;
  /** Rank or similarity rounded to 6 decimals, as a decimal string. */
  scoreKey: string;
  nameKey: string;
}

export interface FacetCount {
  id: string;
  label: string;
  count: number;
}

export interface SearchFacets {
  categories: FacetCount[];
  materials: FacetCount[];
  colors: FacetCount[];
  price: { minCents: number; maxCents: number } | null;
  inStockCount: number;
}

export interface SearchPlan {
  criteria: SearchCriteria;
  mode: MatchMode;
  order: SortTerm[];
  /** Keyset position: sort values of the last item of the previous page. */
  after: SortValue[] | null;
  /** Rows to fetch (page size + 1 to detect a next page). */
  fetch: number;
}

export interface SearchPage {
  rows: SearchHitRow[];
  total: number;
  facets: SearchFacets;
}

export interface SuggestionRow {
  slug: string;
  name: string;
  kind: string;
  heroImageUrl: string;
  priceCents: number;
}

/** Query side of the search read model (Postgres full text + pg_trgm). */
export abstract class SearchReadModel {
  /** Whether any searchable product matches the tsquery (decides between full text and the typo fallback). */
  abstract hasFullTextMatch(tsquery: string): Promise<boolean>;
  /** Name of the searchable product most similar to `text` with similarity ≥ threshold, if any. */
  abstract closestName(text: string, threshold: number): Promise<string | null>;
  /** Result page, total and facet counts, read from one consistent snapshot. */
  abstract search(plan: SearchPlan): Promise<SearchPage>;
  /** Prefix matches first, then trigram-similar names. */
  abstract suggest(prefixPattern: string, text: string, threshold: number, limit: number): Promise<SuggestionRow[]>;
}

/** Maintenance side: emptiness check and truncation used by rebuilds. */
export abstract class SearchIndexMaintenance {
  abstract isEmpty(): Promise<boolean>;
  abstract truncate(): Promise<void>;
}
