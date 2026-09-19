import type { CatalogSnapshotDto, SearchQuery, SearchResultDto } from "@meridian/contracts";
import { revalidatePath, revalidateTag } from "next/cache";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { connection } from "next/server";
import { getCatalog, invalidateCatalog } from "./catalog";
import { searchProducts } from "./search";
import { services } from "./services";

/**
 * Data for the ISR pages (home, /shop, /shop/[category], /product/[slug]).
 *
 * Without Cache Components, a `cache: "no-store"` fetch (the default for every service call) during a prerender turns
 * the route dynamic, and during a background refresh it aborts the refresh, so these reads use Next's fetch cache
 * (`renderCache`): tagged, refreshed at most every `RENDER_REVALIDATE_S` seconds, and dropped on demand by admin writes.
 * Stock is never read here; product pages fetch it in the browser.
 */

/** Keep in step with `export const revalidate = 60` in the ISR pages (segment config must be a literal). */
export const RENDER_REVALIDATE_S = 60;

export const RENDER_TAGS = {
  /** The catalog snapshot: layout (footer, client catalog), home, shop chrome and product pages. */
  catalog: "storefront:catalog",
  /** First search read-model page of the canonical /shop and /shop/[category] listings. */
  listings: "storefront:listings",
} as const;

// Both read through Next's tagged fetch cache (not `no-store`, which would abort every background refresh in
// production) and straight from the service rather than the BFF's own 60 s snapshot cache, so a page is never two
// cache windows behind. The BFF snapshot is only the fallback when catalog-service is unreachable.
export function cachedCatalog(): Promise<CatalogSnapshotDto> {
  return services.catalog
    .get<CatalogSnapshotDto>("/catalog/snapshot", { renderCache: { revalidate: RENDER_REVALIDATE_S, tags: [RENDER_TAGS.catalog] } })
    .catch((error: unknown) => {
      console.warn(JSON.stringify({ level: "warn", msg: "render catalog read failed; using the BFF snapshot", error: error instanceof Error ? `${error.message} / ${String((error as { cause?: unknown }).cause)}` : String(error) }));
      return getCatalog();
    });
}

export function cachedSearch(query: SearchQuery): Promise<SearchResultDto> {
  return searchProducts(query, { revalidate: RENDER_REVALIDATE_S, tags: [RENDER_TAGS.listings] });
}

/**
 * Called when an upstream is unavailable while rendering a cacheable route. During `next build` it opts the route into
 * per-request rendering (`connection()` interrupts the prerender), so the build neither fails nor bakes an empty page;
 * at runtime it returns and the caller decides (rethrow to keep serving the last good ISR page, or degrade).
 */
export async function renderPerRequestIfBuilding(): Promise<void> {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) await connection();
}

function run(label: string, work: () => void) {
  try {
    work();
  } catch (error) {
    // Outside a Next request (unit tests, scripts) there is no incremental cache to revalidate.
    console.warn(JSON.stringify({ level: "warn", msg: "storefront revalidation skipped", label, error: error instanceof Error ? error.message : String(error) }));
  }
}

/**
 * On-demand revalidation after a write through the BFF admin procedures.
 * - `catalog`: products, variants, images, publish/archive, sold-out flag or category changed. The snapshot feeds the
 *   root layout (footer categories, client catalog) and therefore every cached page, so the whole tree is revalidated,
 *   plus `slug`'s own product page when the write names one.
 * - `listings`: stock or the search index changed; only the listing pages bake search hits (in-stock badges).
 * Tags expire immediately (`expire: 0`) so the next visitor gets a fresh render rather than the stale page.
 */
export function revalidateStorefront(change: "catalog" | "listings", slug?: string): void {
  if (change === "catalog") {
    invalidateCatalog();
    run("catalog", () => {
      revalidateTag(RENDER_TAGS.catalog, { expire: 0 });
      revalidateTag(RENDER_TAGS.listings, { expire: 0 });
      revalidatePath("/", "layout");
      // The written product's own page: without its exact path the next visitor is still served the stale render once
      // (a just-published piece as 404, an archived one as 200) while the refresh happens behind them.
      if (slug) revalidatePath(`/product/${slug}`);
    });
    return;
  }
  run("listings", () => {
    revalidateTag(RENDER_TAGS.listings, { expire: 0 });
    revalidatePath("/shop");
    revalidatePath("/shop/[category]", "page");
  });
}
