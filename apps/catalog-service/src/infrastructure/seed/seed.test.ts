import { describe, expect, it } from "vitest";
import { COLOR_FAMILIES } from "../../domain/product/product-variant";
import { StorefrontCatalogSeedSource } from "./catalog-seed-source";
import { deriveMaterialIds } from "./materials";
import { pieces } from "./products";

describe("storefront seed data", () => {
  const seed = new StorefrontCatalogSeedSource().load();

  it("moves all 29 products, 4 categories and the 19 materials with swatches", () => {
    expect(seed.products).toHaveLength(29);
    expect(seed.categories.map((c) => c.id)).toEqual(["seating", "tables", "lighting", "storage"]);
    expect(seed.materials).toHaveLength(19);
    expect(seed.materials.every((m) => m.swatchUrl.startsWith("/materials/"))).toBe(true);
    expect(new Set(seed.products.map((p) => p.slug)).size).toBe(29);
    expect(new Set(seed.products.flatMap((p) => p.variants.map((v) => v.sku))).size).toBe(seed.products.flatMap((p) => p.variants).length);
  });

  it("converts euro prices to cents and keeps details and image paths", () => {
    const holt = seed.products.find((p) => p.slug === "holt-sofa")!;
    expect(holt).toMatchObject({ priceCents: 119_000, categoryId: "seating", heroImageUrl: "/products/holt-sofa-hero.jpg", detailImageUrl: "/products/holt-sofa-detail-photo.jpg", materials: ["walnut", "wool"] });
    expect(holt.details).toMatchObject({ widthCm: 240, depthCm: 92, heightCm: 78, weightKg: 68 });
    expect(holt.variants.map((v) => v.imageUrl)).toEqual(["/products/holt-sofa-hero.jpg", "/products/holt-sofa-charcoal.jpg"]);
    expect(seed.products.find((p) => p.slug === "sideboard-kiln")?.soldOut).toBe(true);
    const sola = seed.products.find((p) => p.slug === "sola-chair")!;
    expect(sola).toMatchObject({ priceCents: 45_000, categoryId: "seating", heroImageUrl: "/products/sola-chair-hero.jpg", materials: ["linen", "cane"] });
    expect(sola.variants.map((v) => v.imageUrl)).toEqual(["/products/sola-chair-hero.jpg", "/products/sola-chair-black.jpg"]);
  });

  it("every variant has a colour family and a material the product and catalog know", () => {
    const materialIds = new Set(seed.materials.map((m) => m.id));
    for (const product of seed.products) {
      expect(product.materials.every((m) => materialIds.has(m))).toBe(true);
      for (const v of product.variants) {
        expect(COLOR_FAMILIES).toContain(v.colorFamily);
        expect(product.materials).toContain(v.material);
      }
    }
  });

  it("material ids follow the storefront's derivation rule", () => {
    expect(pieces.map((p) => deriveMaterialIds(p.materials, p.variants.map((v) => v.label)))).toEqual(seed.products.map((p) => p.materials));
    expect(deriveMaterialIds("black steel, linen shade", ["Black steel", "Brass"])).toEqual(["linen", "brass", "steel"]);
  });
});
