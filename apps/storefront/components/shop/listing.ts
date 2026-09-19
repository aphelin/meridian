import type { ColorFamily, SearchQuery, SearchSort } from "@meridian/contracts";

/** Listing state shared by /shop, /shop/[category] and /search. It lives in the URL so filtered views can be shared. */

export type SearchParams = Record<string, string | string[] | undefined>;

export const COLOR_FAMILIES: readonly ColorFamily[] = ["neutral", "white", "black", "grey", "brown", "green", "blue", "red", "orange", "yellow", "pink", "metal"];

/** 4 × 4 on wide screens; the seeded collection alone always needs a second page. */
export const PAGE_SIZE = 16;

export interface ListingState {
  q: string;
  colours: ColorFamily[];
  materials: string[];
  /** Whole-euro bounds in cents; null = open. */
  minCents: number | null;
  maxCents: number | null;
  inStock: boolean;
  sort: SearchSort;
}

export const SORTS: { id: SearchSort; label: string; needsText?: boolean }[] = [
  { id: "relevance", label: "Best match", needsText: true },
  { id: "featured", label: "Featured" },
  { id: "newest", label: "Newest" },
  { id: "price-asc", label: "Price, low to high" },
  { id: "price-desc", label: "Price, high to low" },
  { id: "name", label: "Name, A to Z" },
];

const SORT_IDS = new Set<string>(SORTS.map((s) => s.id));
const MAX_VALUES = 12;

const one = (params: SearchParams, key: string) => {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
};

const list = (raw: string | undefined) =>
  [...new Set((raw ?? "").split(",").map((v) => v.trim().toLowerCase()).filter((v) => /^[a-z0-9-]{1,40}$/.test(v)))].slice(0, MAX_VALUES);

const euros = (raw: string | undefined) => {
  if (!raw || !/^\d{1,7}$/.test(raw)) return null;
  return Number(raw) * 100;
};

export function defaultSort(q: string): SearchSort {
  return q.trim() ? "relevance" : "featured";
}

export function parseListing(params: SearchParams): ListingState {
  const q = (one(params, "q") ?? "").slice(0, 200);
  const colours = list(one(params, "colour")).filter((c): c is ColorFamily => (COLOR_FAMILIES as readonly string[]).includes(c));
  let minCents = euros(one(params, "min"));
  let maxCents = euros(one(params, "max"));
  if (minCents !== null && maxCents !== null && minCents > maxCents) [minCents, maxCents] = [maxCents, minCents];
  const sort = one(params, "sort");
  const resolved = sort && SORT_IDS.has(sort) ? (sort as SearchSort) : defaultSort(q);
  return {
    q,
    colours,
    materials: list(one(params, "material")),
    minCents,
    maxCents,
    inStock: one(params, "stock") === "in",
    sort: resolved === "relevance" && !q.trim() ? "featured" : resolved,
  };
}

/** The query string for a state (without "?"); defaults are left out so URLs stay short. */
export function listingQuery(state: ListingState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.colours.length) params.set("colour", state.colours.join(","));
  if (state.materials.length) params.set("material", state.materials.join(","));
  if (state.minCents !== null) params.set("min", String(Math.round(state.minCents / 100)));
  if (state.maxCents !== null) params.set("max", String(Math.round(state.maxCents / 100)));
  if (state.inStock) params.set("stock", "in");
  if (state.sort !== defaultSort(state.q)) params.set("sort", state.sort);
  return params.toString();
}

export function toSearchQuery(state: ListingState, category?: string): Omit<SearchQuery, "cursor"> {
  const q = state.q.trim();
  return {
    ...(q ? { q } : {}),
    ...(category ? { category } : {}),
    ...(state.materials.length ? { materials: state.materials } : {}),
    ...(state.colours.length ? { colors: state.colours } : {}),
    ...(state.minCents !== null ? { minPriceCents: state.minCents } : {}),
    ...(state.maxCents !== null ? { maxPriceCents: state.maxCents } : {}),
    ...(state.inStock ? { inStock: true } : {}),
    sort: state.sort,
    limit: PAGE_SIZE,
  };
}

export function activeFilterCount(state: ListingState): number {
  return state.colours.length + state.materials.length + (state.minCents !== null || state.maxCents !== null ? 1 : 0) + (state.inStock ? 1 : 0);
}

export function clearedFilters(state: ListingState): ListingState {
  return { ...state, colours: [], materials: [], minCents: null, maxCents: null, inStock: false };
}

export function toggle<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

// ── price slider scale ──────────────────────────────────────────────────────────────────────────────────────────────
// Prices span €100 lamps to five-figure sofas, so the slider is quadratic: fine steps at the low end, big ones at the top.

export const SLIDER_STEPS = 200;

export function priceBounds(facet: { minCents: number; maxCents: number } | null | undefined) {
  if (!facet) return null;
  const lo = Math.floor(facet.minCents / 1000) * 1000;
  const hi = Math.max(lo + 1000, Math.ceil(facet.maxCents / 1000) * 1000);
  return { lo, hi };
}

export function positionToCents(position: number, bounds: { lo: number; hi: number }) {
  const t = Math.min(1, Math.max(0, position / SLIDER_STEPS));
  const raw = bounds.lo + (bounds.hi - bounds.lo) * t * t;
  return Math.min(bounds.hi, Math.max(bounds.lo, Math.round(raw / 1000) * 1000));
}

export function centsToPosition(cents: number, bounds: { lo: number; hi: number }) {
  const t = (Math.min(bounds.hi, Math.max(bounds.lo, cents)) - bounds.lo) / (bounds.hi - bounds.lo || 1);
  return Math.round(Math.sqrt(t) * SLIDER_STEPS);
}
