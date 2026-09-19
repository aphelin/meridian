import type { ColorFamily, SearchSort } from "@meridian/contracts";
import { ValidationError } from "@meridian/kernel";
import type { MatchMode } from "./match-mode";
import { SearchText } from "./search-text";
import { sortTerms, type SortTerm } from "./sort-order";

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 50;
const MAX_MULTI_VALUES = 20;

/** Every narrowing a shopper can apply; each facet is counted with all filters except its own. */
export type FilterName = "category" | "materials" | "colors" | "price" | "inStock";
export const FILTER_NAMES: readonly FilterName[] = ["category", "materials", "colors", "price", "inStock"];

/** Facets computed next to the result list. `inStock` is the in-stock count. */
export type FacetName = FilterName;

export interface SearchCriteriaInput {
  q?: string | null;
  category?: string | null;
  materials?: readonly string[];
  colors?: readonly ColorFamily[];
  minPriceCents?: number | null;
  maxPriceCents?: number | null;
  inStock?: boolean;
  sort?: SearchSort | null;
  limit?: number | null;
  cursor?: string | null;
}

/** A validated product search: text, filters, order and page window. */
export class SearchCriteria {
  private constructor(
    readonly text: SearchText | null,
    readonly category: string | null,
    readonly materials: readonly string[],
    readonly colors: readonly ColorFamily[],
    readonly minPriceCents: number | null,
    readonly maxPriceCents: number | null,
    readonly inStockOnly: boolean,
    readonly sort: SearchSort,
    readonly limit: number,
    readonly cursor: string | null,
  ) {}

  static create(input: SearchCriteriaInput): SearchCriteria {
    const text = SearchText.parse(input.q);
    const limit = input.limit ?? DEFAULT_PAGE_SIZE;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw new ValidationError(`limit must be between 1 and ${MAX_PAGE_SIZE}`);
    const min = input.minPriceCents ?? null;
    const max = input.maxPriceCents ?? null;
    for (const bound of [min, max]) {
      if (bound !== null && (!Number.isSafeInteger(bound) || bound < 0)) throw new ValidationError("Price bounds must be whole, non-negative cents");
    }
    if (min !== null && max !== null && min > max) throw new ValidationError("minPriceCents must not exceed maxPriceCents");
    const materials = distinct(input.materials ?? []);
    const colors = distinct(input.colors ?? []);
    if (materials.length > MAX_MULTI_VALUES || colors.length > MAX_MULTI_VALUES) throw new ValidationError(`At most ${MAX_MULTI_VALUES} values per filter`);
    const category = input.category?.trim() || null;
    // Relevance needs text to rank by; without text the merchandised order is the sensible default.
    const requested = input.sort ?? (text ? "relevance" : "featured");
    const sort: SearchSort = requested === "relevance" && !text ? "featured" : requested;
    return new SearchCriteria(text, category, materials, colors, min, max, input.inStock === true, sort, limit, input.cursor?.trim() || null);
  }

  /** Filters that are actually narrowing the result. */
  activeFilters(): FilterName[] {
    return FILTER_NAMES.filter((name) => this.isActive(name));
  }

  isActive(name: FilterName): boolean {
    switch (name) {
      case "category":
        return this.category !== null;
      case "materials":
        return this.materials.length > 0;
      case "colors":
        return this.colors.length > 0;
      case "price":
        return this.minPriceCents !== null || this.maxPriceCents !== null;
      case "inStock":
        return this.inStockOnly;
    }
  }

  /**
   * Filters applied when counting a facet: all active filters except the facet's own, so selecting "Seating" still
   * shows how many "Tables" there are (the other values stay selectable).
   */
  filtersForFacet(facet: FacetName): FilterName[] {
    return this.activeFilters().filter((name) => name !== facet);
  }

  sortTerms(): SortTerm[] {
    return sortTerms(this.sort);
  }

  /** Identity of the ordered result a cursor may continue. */
  cursorFingerprint(mode: MatchMode): string {
    return [this.sort, mode.kind, this.text?.fingerprint() ?? ""].join("|");
  }
}

function distinct<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase() as T).filter(Boolean))];
}
