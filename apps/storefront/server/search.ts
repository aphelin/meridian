import type { SearchQuery, SearchResultDto } from "@meridian/contracts";
import { type CallOptions, SEARCH_TIMEOUT_MS, services } from "./services";

/** One page of the search read model: behind `search.products` and the server-rendered first page of /shop and /search. */
export function searchProducts(input: SearchQuery, renderCache?: CallOptions["renderCache"]): Promise<SearchResultDto> {
  return services.search.get<SearchResultDto>("/search/products", {
    timeoutMs: SEARCH_TIMEOUT_MS,
    renderCache,
    query: {
      q: input.q,
      category: input.category,
      materials: input.materials,
      colors: input.colors,
      minPriceCents: input.minPriceCents,
      maxPriceCents: input.maxPriceCents,
      inStock: input.inStock,
      sort: input.sort,
      limit: input.limit,
      cursor: input.cursor,
    },
  });
}
