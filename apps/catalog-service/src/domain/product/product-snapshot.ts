import type { ProductSnapshot } from "@meridian/contracts";
import type { Product } from "./product";

/**
 * Builds the contracts `ProductSnapshot` carried by ProductPublished/ProductUpdated. search-worker and inventory
 * consume it, so every field is set explicitly and nothing else is added.
 */
export function toProductSnapshot(product: Product, categoryLabel: string): ProductSnapshot {
  const s = product.toState();
  return {
    productId: s.id,
    slug: s.slug,
    name: s.name,
    kind: s.kind,
    story: s.story,
    categoryId: s.categoryId,
    categoryLabel,
    materials: [...s.materials],
    priceCents: s.priceCents,
    currency: "EUR",
    status: s.status,
    featured: s.featured,
    soldOut: s.soldOut,
    heroImageUrl: s.heroImageUrl,
    variants: s.variants.map((v) => ({
      sku: v.sku,
      variantId: v.id,
      label: v.label,
      colorFamily: v.colorFamily,
      material: v.material,
      swatchUrl: v.swatchUrl,
      imageUrl: v.imageUrl,
    })),
    ratingAvg: s.rating.average,
    ratingCount: s.rating.count,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
