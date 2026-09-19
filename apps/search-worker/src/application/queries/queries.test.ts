import { describe, expect, it } from "vitest";
import { SearchCursor, sortTerms } from "../../domain";
import { ScriptedReadModel } from "../../test-support/in-memory";
import type { SearchHitRow } from "../ports";
import { SearchProductsHandler } from "./search-products.handler";
import { SearchProductsQuery } from "./search-products.query";
import { SuggestProductsHandler } from "./suggest-products.handler";
import { SuggestProductsQuery } from "./suggest-products.query";

const row = (name: string, over: Partial<SearchHitRow> = {}): SearchHitRow => ({
  productId: `prod_${name.toLowerCase()}`,
  slug: `${name.toLowerCase()}-x`,
  name,
  kind: "Sofa",
  categoryId: "seating",
  priceCents: 100_000,
  heroImageUrl: "/p.jpg",
  inStock: true,
  featured: false,
  ratingAvg: null,
  ratingCount: 0,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  scoreKey: "0",
  nameKey: name.toLowerCase(),
  ...over,
});

describe("SearchProductsHandler", () => {
  it("runs a full-text search query ranked by relevance with no did you mean", async () => {
    const readModel = new ScriptedReadModel();
    readModel.page = { ...readModel.page, rows: [row("Holt", { scoreKey: "0.607927" })], total: 1 };
    const result = await new SearchProductsHandler(readModel).execute(new SearchProductsQuery({ q: "wool sofa" }));
    expect(readModel.plans[0]!.mode).toEqual({ kind: "full-text", tsquery: "wool & sofa:*" });
    expect(readModel.plans[0]!.order[0]).toEqual({ field: "score", direction: "desc" });
    expect(result.items[0]).toMatchObject({ slug: "holt-x", score: 0.607927 });
    expect(result.didYouMean).toBeNull();
  });

  it("typo fallback: trigram mode with did you mean when full text matches nothing", async () => {
    const readModel = new ScriptedReadModel();
    readModel.fullTextMatches = false;
    readModel.closest = "Holt";
    readModel.page = { ...readModel.page, rows: [row("Holt", { scoreKey: "0.571429" })], total: 1 };
    const result = await new SearchProductsHandler(readModel).execute(new SearchProductsQuery({ q: "hollt" }));
    expect(readModel.plans[0]!.mode).toEqual({ kind: "fuzzy", text: "hollt", threshold: 0.3 });
    expect(result.didYouMean).toBe("Holt");
  });

  it("returns a next cursor only when there is another page and continues from it", async () => {
    const readModel = new ScriptedReadModel();
    readModel.page = { ...readModel.page, rows: [row("Dune"), row("Holt"), row("Kiln")], total: 6 };
    const handler = new SearchProductsHandler(readModel);
    const first = await handler.execute(new SearchProductsQuery({ sort: "name", limit: 2 }));
    expect(readModel.plans[0]!.fetch).toBe(3);
    expect(first.items.map((i) => i.name)).toEqual(["Dune", "Holt"]);
    expect(first.nextCursor).not.toBeNull();
    expect(SearchCursor.decode(first.nextCursor!, "name|browse|", sortTerms("name")).values).toEqual(["holt", "prod_holt"]);

    readModel.page = { ...readModel.page, rows: [row("Kiln"), row("Kite")] };
    const second = await handler.execute(new SearchProductsQuery({ sort: "name", limit: 2, cursor: first.nextCursor }));
    expect(readModel.plans[1]!.after).toEqual(["holt", "prod_holt"]);
    expect(second.nextCursor).toBeNull();
  });

  it("rejects a cursor issued for another sort", async () => {
    const readModel = new ScriptedReadModel();
    readModel.page = { ...readModel.page, rows: [row("Dune"), row("Holt")], total: 2 };
    const handler = new SearchProductsHandler(readModel);
    const first = await handler.execute(new SearchProductsQuery({ sort: "name", limit: 1 }));
    await expect(handler.execute(new SearchProductsQuery({ sort: "newest", limit: 1, cursor: first.nextCursor }))).rejects.toThrow(/cursor/i);
  });

  it("passes facet results and filters through unchanged (facet counts come from the read model)", async () => {
    const readModel = new ScriptedReadModel();
    readModel.page = {
      rows: [],
      total: 2,
      facets: { categories: [{ id: "tables", label: "Tables", count: 1 }], materials: [{ id: "oak", label: "Oak", count: 4 }], colors: [], price: { minCents: 1, maxCents: 2 }, inStockCount: 5 },
    };
    const result = await new SearchProductsHandler(readModel).execute(new SearchProductsQuery({ category: "seating", materials: ["oak"], inStock: true }));
    expect(readModel.plans[0]!.criteria.filtersForFacet("category")).toEqual(["materials", "inStock"]);
    expect(result.facets).toEqual(readModel.page.facets);
  });
});

describe("SuggestProductsHandler", () => {
  it("suggests by prefix and trigram similarity", async () => {
    const readModel = new ScriptedReadModel();
    readModel.suggestions = [{ slug: "holt-sofa", name: "Holt", kind: "Sofa", heroImageUrl: "/h.jpg", priceCents: 1 }];
    const result = await new SuggestProductsHandler(readModel).execute(new SuggestProductsQuery("Ho", 5));
    expect(readModel.suggestCalls[0]).toEqual(["ho%", "Ho", 0.3, 5]);
    expect(result[0]!.slug).toBe("holt-sofa");
  });

  it("returns nothing for blank input without touching the read model", async () => {
    const readModel = new ScriptedReadModel();
    expect(await new SuggestProductsHandler(readModel).execute(new SuggestProductsQuery("  "))).toEqual([]);
    expect(readModel.suggestCalls).toHaveLength(0);
  });
});
