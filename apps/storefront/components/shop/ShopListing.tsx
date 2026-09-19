import type { CatalogSnapshotDto, SearchResultDto } from "@meridian/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalog } from "@/server/catalog";
import { cachedCatalog, cachedSearch, renderPerRequestIfBuilding } from "@/server/render-cache";
import { searchProducts } from "@/server/search";
import { parseListing, toSearchQuery, type SearchParams } from "./listing";
import { pageMetadata } from "./seo";
import { ShopView } from "./ShopView";

export const SHOP_METADATA: Metadata = pageMetadata({
  title: "Shop all furniture",
  description: "Every piece in the Meridian collection: sofas, chairs, tables, lighting and storage in wool, oak, walnut and brass.",
  path: "/shop",
  image: "/hero/room-01.jpg",
});

/** Canonical metadata for /shop or /shop/[category]; filtered variants share it (canonical without the query string). */
export async function shopMetadata(category: string | undefined, catalog: () => Promise<CatalogSnapshotDto>): Promise<Metadata> {
  if (!category) return SHOP_METADATA;
  const found = (await catalog().catch(() => null))?.categories.find((c) => c.id === category);
  if (!found) return { title: "Shop" };
  return pageMetadata({ title: found.label, description: found.blurb, path: `/shop/${found.id}`, image: found.coverImageUrl });
}

/**
 * /shop and /shop/[category] with the first results page (hits and facets) rendered on the server.
 *
 * - Without `searchParams`: the canonical, unfiltered listing. Rendered inside an ISR route, so data comes from the
 *   tagged data cache. An unavailable catalog keeps the last good page (the error propagates; during `next build` the
 *   route renders per request instead); an unavailable search index renders the page without a seed and the browser
 *   fetches the hits.
 * - With `searchParams`: a filtered listing (`?colour=…`, rewritten to /shop-filtered by next.config.ts), rendered per
 *   request from live data.
 */
export async function ShopListing({ category, searchParams }: { category?: string; searchParams?: SearchParams }) {
  const live = searchParams !== undefined;
  const initial = parseListing({ ...searchParams, q: undefined });
  const query = toSearchQuery(initial, category);

  const catalog = await (live ? getCatalog() : cachedCatalog()).catch(async (error: unknown) => {
    if (!live) await renderPerRequestIfBuilding();
    throw error;
  });
  if (category && !catalog.categories.some((c) => c.id === category)) notFound();

  const page = await (live ? searchProducts(query) : cachedSearch(query)).catch(async (): Promise<SearchResultDto | undefined> => {
    if (!live) await renderPerRequestIfBuilding();
    return undefined;
  });

  return (
    <ShopView
      key={category}
      categories={catalog.categories}
      materials={catalog.materials}
      category={category}
      initial={initial}
      seed={page ? { state: initial, page } : undefined}
    />
  );
}
