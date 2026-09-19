import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { absoluteUrl } from "@/components/shop/seo";
import { getCatalog } from "@/server/catalog";

const CONTENT_PAGES = ["/terms", "/privacy", "/shipping-returns", "/faq", "/contact"];

/** Home, shop, categories, every published product and the content pages. Built per request from the catalog snapshot. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const catalog = await getCatalog().catch(() => null);
  const products = (catalog?.products ?? []).filter((p) => p.status === "published");
  const newest = products.reduce<string | undefined>((max, p) => (!max || p.updatedAt > max ? p.updatedAt : max), undefined);
  const lastModified = newest ? new Date(newest) : undefined;

  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/shop"), lastModified, changeFrequency: "daily", priority: 0.9 },
    ...[...(catalog?.categories ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ url: absoluteUrl(`/shop/${c.id}`), lastModified, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({
      url: absoluteUrl(`/product/${p.slug}`),
      lastModified: new Date(p.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
      images: [absoluteUrl(p.heroImageUrl)],
    })),
    ...CONTENT_PAGES.map((path) => ({ url: absoluteUrl(path), changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}
