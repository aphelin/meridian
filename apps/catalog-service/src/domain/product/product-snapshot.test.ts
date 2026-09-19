import { describe, expect, it } from "vitest";
import { publishedProduct } from "../../testing/in-memory";
import { toProductSnapshot } from "./product-snapshot";

describe("ProductSnapshot builder", () => {
  it("builds exactly the contracts ProductSnapshot fields for a published product", () => {
    const product = publishedProduct();
    product.recordRating(4, new Date());
    const snapshot = toProductSnapshot(product, "Seating");
    expect(Object.keys(snapshot).sort()).toEqual(
      ["productId", "slug", "name", "kind", "story", "categoryId", "categoryLabel", "materials", "priceCents", "currency", "status", "featured", "soldOut", "heroImageUrl", "variants", "ratingAvg", "ratingCount", "createdAt", "updatedAt"].sort(),
    );
    expect(snapshot).toMatchObject({ productId: "prd_holt", categoryLabel: "Seating", currency: "EUR", status: "published", priceCents: 240_000, ratingAvg: 4, ratingCount: 1 });
    expect(Object.keys(snapshot.variants[0]).sort()).toEqual(["sku", "variantId", "label", "colorFamily", "material", "swatchUrl", "imageUrl"].sort());
    expect(snapshot.variants.map((v) => v.variantId)).toEqual(["oatmeal", "charcoal"]);
  });

  it("carries the soldOut stop-sell flag (amendment 1p)", () => {
    expect(toProductSnapshot(publishedProduct(), "Seating").soldOut).toBe(false);
    const product = publishedProduct();
    product.revise({ soldOut: true }, new Date());
    expect(toProductSnapshot(product, "Seating").soldOut).toBe(true);
  });
});
