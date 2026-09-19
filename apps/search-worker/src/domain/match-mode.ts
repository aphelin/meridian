import type { SearchText } from "./search-text";

/** Trigram similarity a product name or kind needs before it counts as a typo match. */
export const TYPO_SIMILARITY_THRESHOLD = 0.3;

/**
 * How the product set is matched against the text:
 * - browse: no text, every published product;
 * - full-text: tsvector @@ tsquery, ranked with ts_rank;
 * - fuzzy: typo tolerance, only when full text matched nothing; trigram similarity on name/kind.
 */
export type MatchMode =
  | { kind: "browse" }
  | { kind: "full-text"; tsquery: string }
  | { kind: "fuzzy"; text: string; threshold: number };

export function chooseMatchMode(text: SearchText | null, fullTextHasMatches: boolean): MatchMode {
  if (!text) return { kind: "browse" };
  if (fullTextHasMatches) return { kind: "full-text", tsquery: text.toTsQuery() };
  return { kind: "fuzzy", text: text.value, threshold: TYPO_SIMILARITY_THRESHOLD };
}

/** `didYouMean` is only offered when the literal query failed and a close spelling exists. */
export function didYouMeanFor(mode: MatchMode, closestName: string | null): string | null {
  return mode.kind === "fuzzy" ? closestName : null;
}
