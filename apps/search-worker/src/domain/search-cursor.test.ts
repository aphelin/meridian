import { describe, expect, it } from "vitest";
import { SearchCursor } from "./search-cursor";
import { sortTerms, sortValuesOf } from "./sort-order";

const hit = { productId: "prod_kiln", scoreKey: "0.607927", featured: false, createdAt: new Date("2026-09-01T10:00:00.123Z"), priceCents: 310_000, nameKey: "kiln" };

describe("SearchCursor (keyset cursor pagination)", () => {
  it("round-trips the sort keys of the last hit", () => {
    const order = sortTerms("relevance");
    const encoded = SearchCursor.after("relevance|full-text|oak", sortValuesOf(hit, order)).encode();
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(SearchCursor.decode(encoded, "relevance|full-text|oak", order).values).toEqual(["0.607927", false, "kiln", "prod_kiln"]);
  });

  it("rejects a cursor from a different query or sort", () => {
    const encoded = SearchCursor.after("name|browse|", sortValuesOf(hit, sortTerms("name"))).encode();
    expect(() => SearchCursor.decode(encoded, "price-asc|browse|", sortTerms("price-asc"))).toThrow(/cursor/i);
  });

  it("rejects tampered or malformed cursors", () => {
    const order = sortTerms("price-asc");
    const forged = Buffer.from(JSON.stringify({ f: "price-asc|browse|", k: ["1; DROP TABLE", "x", "y"] })).toString("base64url");
    expect(() => SearchCursor.decode(forged, "price-asc|browse|", order)).toThrow(/cursor/i);
    expect(() => SearchCursor.decode("not a cursor!", "price-asc|browse|", order)).toThrow(/cursor/i);
    expect(() => SearchCursor.decode("x".repeat(2000), "price-asc|browse|", order)).toThrow(/cursor/i);
  });

  it("every sort order ends with the product id so cursor pages never overlap", () => {
    for (const sort of ["relevance", "featured", "newest", "price-asc", "price-desc", "name"] as const) {
      expect(sortTerms(sort).at(-1)).toEqual({ field: "productId", direction: "asc" });
    }
  });
});
