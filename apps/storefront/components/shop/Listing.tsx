"use client";

import { keepPreviousData } from "@tanstack/react-query";
import type { MaterialDto, ProductDto, SearchHitDto, SearchResultDto } from "@meridian/contracts";
import { useMemo, type ReactNode } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { plural } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { HitCard, ProductCard, ProductGrid } from "../product/ProductCard";
import { FilterBar } from "./FilterBar";
import { activeFilterCount, clearedFilters, PAGE_SIZE, toSearchQuery, type ListingState } from "./listing";
import { ProductCardSkeleton, QueryError } from "./states";

/** The first results page the server rendered, for the listing state it was rendered with. */
export interface ListingSeed {
  state: ListingState;
  page: SearchResultDto;
}

/**
 * Search read model results for a listing state, as cursor pages. A server-rendered `seed` becomes the initial data of
 * its own query (and only that one), so hydration shows the same hits without fetching them again; filters, sort and
 * "Load more" then fetch as usual.
 */
export function useListing(state: ListingState, category?: string, enabled = true, seed?: ListingSeed) {
  const input = toSearchQuery(state, category);
  const seeded = seed && JSON.stringify(toSearchQuery(seed.state, category)) === JSON.stringify(input) ? seed.page : undefined;
  return trpc.search.products.useInfiniteQuery(input, {
    enabled,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    initialData: seeded ? { pages: [seeded], pageParams: [undefined] } : undefined,
  });
}

/** Full catalog products for the hits (swatches, quick add), from the snapshot or, for brand-new pieces, `catalog.bySlugs`. */
function useProductsFor(hits: SearchHitDto[]) {
  const catalog = useCatalog();
  const bySlug = useMemo(() => new Map(catalog.products.map((p) => [p.slug, p])), [catalog.products]);
  const missing = hits.filter((h) => !bySlug.has(h.slug)).map((h) => h.slug).slice(0, 50);
  const extra = trpc.catalog.bySlugs.useQuery({ slugs: missing }, { enabled: missing.length > 0, staleTime: 60_000 });
  return (slug: string): ProductDto | undefined => bySlug.get(slug) ?? extra.data?.find((p) => p.slug === slug);
}

export function Listing({
  state,
  onChange,
  category,
  materials,
  enabled = true,
  seed,
  header,
  emptyTitle = "Nothing matches those filters",
  emptyHint = "Try another colour or material, widen the price range, or include pieces that are sold out.",
}: {
  state: ListingState;
  onChange: (next: ListingState) => void;
  category?: string;
  materials: MaterialDto[];
  enabled?: boolean;
  seed?: ListingSeed;
  /** Rendered between the filter bar and the count (e.g. "Did you mean"). Receives the first page. */
  header?: (first: SearchResultDto | undefined) => ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const query = useListing(state, category, enabled, seed);
  const pages = query.data?.pages ?? [];
  const first = pages[0];
  const hits = useMemo(() => {
    const seen = new Set<string>();
    return pages.flatMap((p) => p.items).filter((h) => (seen.has(h.productId) ? false : (seen.add(h.productId), true)));
  }, [pages]);
  const productFor = useProductsFor(hits);
  const updating = query.isPlaceholderData || (query.isFetching && !query.isFetchingNextPage && !query.isPending);
  const filtered = activeFilterCount(state) > 0;

  return (
    <>
      <FilterBar state={state} facets={first?.facets} materials={materials} onChange={onChange} />
      {header?.(first)}

      {query.isError && !query.isFetchNextPageError ? (
        <QueryError className="mt-6" title="We couldn’t load these pieces." error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <p className="mt-6 min-h-6 text-sm text-stone" aria-live="polite">
            {query.isPending ? "Loading pieces…" : updating ? "Updating…" : first ? plural(first.total, "piece") : null}
          </p>

          {query.isPending ? (
            <div className="mt-6" aria-busy="true">
              <ProductGrid>
                {Array.from({ length: 8 }, (_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </ProductGrid>
            </div>
          ) : hits.length ? (
            <div className={`mt-6 transition-opacity duration-300 ${updating ? "opacity-60" : ""}`} aria-busy={updating || undefined}>
              <ProductGrid>
                {hits.map((hit, i) => {
                  const piece = productFor(hit.slug);
                  return piece ? (
                    <ProductCard key={hit.productId} piece={piece} soldOut={!hit.inStock || piece.soldOut} priority={i < 4} />
                  ) : (
                    <HitCard key={hit.productId} hit={hit} priority={i < 4} />
                  );
                })}
                {query.isFetchingNextPage ? Array.from({ length: Math.min(PAGE_SIZE, (first?.total ?? 0) - hits.length, 8) }, (_, i) => <ProductCardSkeleton key={`more-${i}`} />) : null}
              </ProductGrid>
            </div>
          ) : (
            <div className="panel mt-6 grid place-items-center px-6 py-20 text-center">
              <p className="heading">{emptyTitle}</p>
              <p className="mt-2 max-w-[48ch] text-stone">{emptyHint}</p>
              {filtered ? (
                <button type="button" className="btn btn-primary mt-6" onClick={() => onChange(clearedFilters(state))}>
                  Clear filters
                </button>
              ) : null}
            </div>
          )}

          {query.isFetchNextPageError ? (
            <QueryError className="mt-8" title="We couldn’t load more pieces." error={query.error} onRetry={() => void query.fetchNextPage()} />
          ) : null}

          {hits.length && first ? (
            <div className="mt-12 flex flex-col items-center gap-4">
              <p className="text-sm text-stone tabular">
                Showing {hits.length} of {first.total}
              </p>
              {query.hasNextPage ? (
                <button type="button" className="btn btn-secondary min-w-44" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                  {query.isFetchingNextPage ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> Loading
                    </>
                  ) : (
                    "Load more"
                  )}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
