import type { Metadata } from "next";
import { shopMetadata, ShopListing } from "@/components/shop/ShopListing";
import { getCatalog } from "@/server/catalog";
import { cachedCatalog } from "@/server/render-cache";

type Props = { params: Promise<{ category: string }> };

// ISR like /shop. Categories missing at build time (or catalog unavailable) render on first request.
export const revalidate = 60;

export async function generateStaticParams(): Promise<{ category: string }[]> {
  const catalog = await getCatalog().catch(() => null);
  return (catalog?.categories ?? []).map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  return shopMetadata(category, cachedCatalog);
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;
  return <ShopListing category={category} />;
}
