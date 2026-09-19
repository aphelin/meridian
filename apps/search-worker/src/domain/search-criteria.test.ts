import { describe, expect, it } from "vitest";
import { SearchCriteria } from "./search-criteria";

describe("SearchCriteria", () => {
  it("a facet ignores its own filter but applies every other active filter", () => {
    const criteria = SearchCriteria.create({ category: "seating", materials: ["oak"], inStock: true });
    expect(criteria.activeFilters()).toEqual(["category", "materials", "inStock"]);
    expect(criteria.filtersForFacet("category")).toEqual(["materials", "inStock"]);
    expect(criteria.filtersForFacet("materials")).toEqual(["category", "inStock"]);
    expect(criteria.filtersForFacet("inStock")).toEqual(["category", "materials"]);
    expect(criteria.filtersForFacet("colors")).toEqual(["category", "materials", "inStock"]);
  });

  it("price facet ignores the price filter only", () => {
    const criteria = SearchCriteria.create({ minPriceCents: 100_000, colors: ["brown"] });
    expect(criteria.filtersForFacet("price")).toEqual(["colors"]);
  });

  it("defaults to relevance with text and featured without, and never ranks by relevance without text", () => {
    expect(SearchCriteria.create({ q: "sofa" }).sort).toBe("relevance");
    expect(SearchCriteria.create({}).sort).toBe("featured");
    expect(SearchCriteria.create({ sort: "relevance" }).sort).toBe("featured");
    expect(SearchCriteria.create({ q: "sofa", sort: "newest" }).sort).toBe("newest");
  });

  it("validates page size and price range", () => {
    expect(SearchCriteria.create({}).limit).toBe(24);
    expect(() => SearchCriteria.create({ limit: 0 })).toThrow(/limit/);
    expect(() => SearchCriteria.create({ limit: 51 })).toThrow(/limit/);
    expect(() => SearchCriteria.create({ minPriceCents: 10, maxPriceCents: 5 })).toThrow(/minPriceCents/);
    expect(() => SearchCriteria.create({ minPriceCents: -1 })).toThrow(/non-negative/);
  });

  it("normalises multi-select facet values (OR within a facet) and drops duplicates", () => {
    const criteria = SearchCriteria.create({ materials: ["Velvet", "linen", "velvet", " "] });
    expect(criteria.materials).toEqual(["velvet", "linen"]);
  });

  it("the cursor fingerprint binds sort, match mode and text", () => {
    const a = SearchCriteria.create({ q: "Wool sofa" });
    const b = SearchCriteria.create({ q: "wool  SOFA" });
    expect(a.cursorFingerprint({ kind: "full-text", tsquery: "wool & sofa:*" })).toBe(b.cursorFingerprint({ kind: "full-text", tsquery: "wool & sofa:*" }));
    expect(a.cursorFingerprint({ kind: "full-text", tsquery: "" })).not.toBe(a.cursorFingerprint({ kind: "fuzzy", text: "Wool sofa", threshold: 0.3 }));
  });
});
