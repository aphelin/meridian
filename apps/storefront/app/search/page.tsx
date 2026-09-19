import type { Metadata } from "next";
import { parseListing, toSearchQuery, type SearchParams } from "@/components/shop/listing";
import { SearchView } from "@/components/shop/SearchView";
import { pageMetadata } from "@/components/shop/seo";
import { getCatalog } from "@/server/catalog";
import { searchProducts } from "@/server/search";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseListing(await searchParams);
  const text = q.trim();
  return pageMetadata({
    title: text ? `Search results for “${text}”` : "Search",
    description: text ? `Pieces in the Meridian collection matching “${text}”.` : "Search the Meridian collection by piece, material or colour.",
    path: text ? `/search?q=${encodeURIComponent(text)}` : "/search",
  });
}

/**
 * Rendered per request (it reads `searchParams`): the first results page for `?q=` is fetched on the server and seeds
 * the client listing. When search is unavailable the page renders without it and the browser shows its own error state.
 */
export default async function SearchPage({ searchParams }: Props) {
  const initial = parseListing(await searchParams);
  const [catalog, page] = await Promise.all([
    getCatalog().catch(() => null),
    initial.q.trim() ? searchProducts(toSearchQuery(initial)).catch(() => undefined) : undefined,
  ]);
  return <SearchView initial={initial} materials={catalog?.materials ?? []} seed={page ? { state: initial, page } : undefined} />;
}
