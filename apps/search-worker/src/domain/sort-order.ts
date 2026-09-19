import type { SearchSort } from "@meridian/contracts";

export type SortField = "score" | "featured" | "createdAt" | "priceCents" | "name" | "productId";
export type SortDirection = "asc" | "desc";
export interface SortTerm {
  field: SortField;
  direction: SortDirection;
}

export const SEARCH_SORTS: readonly SearchSort[] = ["relevance", "featured", "newest", "price-asc", "price-desc", "name"];

/**
 * Total orders for every sort. Each ends with the product id so the order is deterministic, which keyset cursor
 * pagination relies on (no duplicates or gaps between pages).
 */
export function sortTerms(sort: SearchSort): SortTerm[] {
  switch (sort) {
    case "relevance":
      return [t("score", "desc"), t("featured", "desc"), t("name", "asc"), t("productId", "asc")];
    case "featured":
      return [t("featured", "desc"), t("createdAt", "desc"), t("productId", "asc")];
    case "newest":
      return [t("createdAt", "desc"), t("productId", "asc")];
    case "price-asc":
      return [t("priceCents", "asc"), t("name", "asc"), t("productId", "asc")];
    case "price-desc":
      return [t("priceCents", "desc"), t("name", "asc"), t("productId", "asc")];
    case "name":
      return [t("name", "asc"), t("productId", "asc")];
  }
}

function t(field: SortField, direction: SortDirection): SortTerm {
  return { field, direction };
}

/** The sort keys of one hit exactly as the read model compares them. */
export interface SortableHit {
  productId: string;
  /** Rounded rank or similarity as a decimal string (exact comparison, no float drift). */
  scoreKey: string;
  featured: boolean;
  createdAt: Date;
  priceCents: number;
  /** Lower-cased name as ordered by the database. */
  nameKey: string;
}

export type SortValue = string | number | boolean;

export function sortValuesOf(hit: SortableHit, terms: readonly SortTerm[]): SortValue[] {
  return terms.map(({ field }) => {
    switch (field) {
      case "score":
        return hit.scoreKey;
      case "featured":
        return hit.featured;
      case "createdAt":
        return hit.createdAt.toISOString();
      case "priceCents":
        return hit.priceCents;
      case "name":
        return hit.nameKey;
      case "productId":
        return hit.productId;
    }
  });
}

/** Checks that decoded cursor values have the type each sort field needs. */
export function sortValuesMatch(values: readonly unknown[], terms: readonly SortTerm[]): values is SortValue[] {
  if (values.length !== terms.length) return false;
  return terms.every(({ field }, index) => {
    const value = values[index];
    switch (field) {
      case "score":
        return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value);
      case "featured":
        return typeof value === "boolean";
      case "createdAt":
        return typeof value === "string" && !Number.isNaN(Date.parse(value));
      case "priceCents":
        return Number.isSafeInteger(value);
      case "name":
      case "productId":
        return typeof value === "string" && value.length <= 500;
    }
  });
}
