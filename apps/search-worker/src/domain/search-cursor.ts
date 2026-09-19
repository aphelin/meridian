import { ValidationError } from "@meridian/kernel";
import { sortValuesMatch, type SortTerm, type SortValue } from "./sort-order";

const MAX_CURSOR_LENGTH = 1024;

/**
 * Opaque keyset cursor: the sort keys of the last item on a page plus a fingerprint of the query that produced it
 * (sort, match mode and text). A cursor can only continue the query it came from; filters may change between
 * pages because keyset positions stay meaningful for any subset.
 */
export class SearchCursor {
  private constructor(
    readonly fingerprint: string,
    readonly values: readonly SortValue[],
  ) {}

  static after(fingerprint: string, values: readonly SortValue[]): SearchCursor {
    return new SearchCursor(fingerprint, values);
  }

  encode(): string {
    return Buffer.from(JSON.stringify({ f: this.fingerprint, k: this.values }), "utf8").toString("base64url");
  }

  static decode(raw: string, expectedFingerprint: string, terms: readonly SortTerm[]): SearchCursor {
    const invalid = () => new ValidationError("Invalid or expired cursor", { issues: [{ path: "cursor", code: "invalid_cursor", message: "Cursor does not belong to this query" }] });
    if (!raw || raw.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) throw invalid();
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
      throw invalid();
    }
    if (!parsed || typeof parsed !== "object") throw invalid();
    const { f, k } = parsed as { f?: unknown; k?: unknown };
    if (f !== expectedFingerprint || !Array.isArray(k) || !sortValuesMatch(k, terms)) throw invalid();
    return new SearchCursor(f, k);
  }
}
