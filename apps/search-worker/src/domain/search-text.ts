import { ValidationError } from "@meridian/kernel";

/**
 * What a shopper typed into the search box, normalised once so every read path (full text, trigram fallback,
 * suggestions, cursor fingerprint) sees the same text.
 */
export class SearchText {
  static readonly MAX_LENGTH = 200;
  static readonly MAX_TOKENS = 10;

  private constructor(
    /** Trimmed, whitespace-collapsed input, as used for trigram similarity. */
    readonly value: string,
    /** Lower-cased letter/number runs; the only characters that ever reach a tsquery. */
    readonly tokens: readonly string[],
  ) {}

  /** Returns null for blank input or input without any letter or digit (nothing to search for). */
  static parse(input: string | null | undefined): SearchText | null {
    if (input === null || input === undefined) return null;
    const value = input.replace(/\s+/g, " ").trim();
    if (!value) return null;
    if (value.length > SearchText.MAX_LENGTH) throw new ValidationError(`Search text must be at most ${SearchText.MAX_LENGTH} characters`);
    const tokens = (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, SearchText.MAX_TOKENS);
    if (!tokens.length) return null;
    return new SearchText(value, tokens);
  }

  /**
   * Full-text query for `to_tsquery`: every token must match (AND) and the last one also matches as a prefix, so
   * results keep up while the shopper is still typing. Tokens contain only letters and digits, so no tsquery
   * operator can be injected.
   */
  toTsQuery(): string {
    return this.tokens.map((token, index) => (index === this.tokens.length - 1 ? `${token}:*` : token)).join(" & ");
  }

  /** `LIKE` pattern matching values that start with the text (wildcards in the input are escaped). */
  likePrefix(): string {
    return `${escapeLike(this.value.toLowerCase())}%`;
  }

  /** Stable text identity for cursors: pages of one query must not be continued by another. */
  fingerprint(): string {
    return this.tokens.join(" ");
  }
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
