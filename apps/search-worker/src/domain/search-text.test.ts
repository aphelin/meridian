import { describe, expect, it } from "vitest";
import { SearchText } from "./search-text";

describe("SearchText (full-text search query)", () => {
  it("builds an AND tsquery with a prefix match on the last token", () => {
    expect(SearchText.parse("  Wool   sofa ")!.toTsQuery()).toBe("wool & sofa:*");
  });

  it("never lets tsquery operators through (only letters and digits reach to_tsquery)", () => {
    const text = SearchText.parse("oak & !(leather | 'x'):* <-> lamp")!;
    expect(text.toTsQuery()).toBe("oak & leather & x & lamp:*");
  });

  it("treats blank or symbol-only input as no search text", () => {
    expect(SearchText.parse("   ")).toBeNull();
    expect(SearchText.parse("&&!!")).toBeNull();
    expect(SearchText.parse(undefined)).toBeNull();
  });

  it("rejects overly long search text", () => {
    expect(() => SearchText.parse("a".repeat(201))).toThrow(/at most 200/);
  });

  it("escapes LIKE wildcards in suggestion prefixes", () => {
    expect(SearchText.parse("50%_off\\")!.likePrefix()).toBe("50\\%\\_off\\\\%");
  });

  it("keeps non-latin letters as tokens", () => {
    expect(SearchText.parse("Café Überstuhl")!.tokens).toEqual(["café", "überstuhl"]);
  });
});
