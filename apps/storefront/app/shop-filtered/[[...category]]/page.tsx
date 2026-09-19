import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { SearchParams } from "@/components/shop/listing";
import { shopMetadata, ShopListing } from "@/components/shop/ShopListing";
import { getCatalog } from "@/server/catalog";

type Props = { params: Promise<{ category?: string[] }>; searchParams: Promise<SearchParams> };

/**
 * Filtered /shop and /shop/[category] (`?colour=`, `material`, `min`, `max`, `stock`, `sort`): next.config.ts rewrites
 * those URLs here so the ISR pages stay free of `searchParams`. Every filter combination is its own URL, so these render
 * per request instead of filling the ISR cache; the canonical URL stays the unfiltered page.
 */
export const dynamic = "force-dynamic";

async function categoryOf(params: Props["params"]) {
  const { category = [] } = await params;
  if (category.length > 1) notFound();
  return category[0];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return shopMetadata(await categoryOf(params), getCatalog);
}

export default async function FilteredShopPage({ params, searchParams }: Props) {
  const [category, query] = await Promise.all([categoryOf(params), searchParams]);
  return <ShopListing category={category} searchParams={query} />;
}
