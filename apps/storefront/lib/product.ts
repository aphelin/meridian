import type { CatalogSnapshotDto, CategoryDto, MaterialDto, ProductDto, VariantDto } from "@meridian/contracts";

/** View helpers over catalog DTOs. Product data always comes from catalog-service (via the BFF), never a static file. */

export const EMPTY_CATALOG: CatalogSnapshotDto = { categories: [], materials: [], products: [] };

export function variantOf(product: ProductDto, variantId?: string | null): VariantDto | undefined {
  return product.variants.find((v) => v.id === variantId) ?? product.variants[0];
}

/** Photo of a finish; the product hero when the variant has none. */
export function variantImage(product: ProductDto, variantId?: string | null): string {
  return variantOf(product, variantId)?.imageUrl || product.heroImageUrl;
}

/** Gallery order: one photo per finish, uploaded images, then `extra` (e.g. the detail photo). */
export function galleryImages(product: ProductDto, extra: string[] = []): string[] {
  const images = [...product.images].sort((a, b) => a.position - b.position).map((i) => i.url);
  return [...new Set([...product.variants.map((v) => variantImage(product, v.id)), product.heroImageUrl, ...images, ...extra].filter(Boolean))];
}

export function categoryOf(catalog: CatalogSnapshotDto, id: string): CategoryDto | undefined {
  return catalog.categories.find((c) => c.id === id);
}

export function productBySlug(catalog: CatalogSnapshotDto, slug: string): ProductDto | undefined {
  return catalog.products.find((p) => p.slug === slug);
}

export function productsIn(catalog: CatalogSnapshotDto, categoryId: string): ProductDto[] {
  return catalog.products.filter((p) => p.categoryId === categoryId);
}

/** Variant (with its product) for a SKU. */
export function bySku(catalog: CatalogSnapshotDto, sku: string): { product: ProductDto; variant: VariantDto } | undefined {
  for (const product of catalog.products) {
    const variant = product.variants.find((v) => v.sku === sku);
    if (variant) return { product, variant };
  }
  return undefined;
}

export function materialLabels(product: ProductDto, materials: MaterialDto[]): string[] {
  const byId = new Map(materials.map((m) => [m.id, m.label]));
  return product.materials.map((id) => byId.get(id) ?? id);
}

/** Every local image the catalog references (used to pre-measure photo plates on the server). */
export function catalogImages(catalog: CatalogSnapshotDto): string[] {
  const set = new Set<string>();
  for (const c of catalog.categories) set.add(c.coverImageUrl);
  for (const p of catalog.products) {
    for (const src of galleryImages(p)) set.add(src);
    if (p.detailImageUrl) set.add(p.detailImageUrl);
  }
  return [...set].filter((src) => src.startsWith("/"));
}
