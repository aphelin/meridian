import { DomainError } from "@meridian/kernel";
import { describe, expect, it } from "vitest";
import { content, NOW, publishedProduct, variant } from "../../testing/in-memory";
import { Product } from "./product";
import { ProductImage } from "./product-image";

const later = new Date(NOW.getTime() + 60_000);
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as DomainError).code;
  }
  return null;
};

describe("Product aggregate", () => {
  it("creates a draft with validated content and no events", () => {
    const product = Product.createDraft("prd_1", content(), NOW);
    expect(product.status).toBe("draft");
    expect(product.toState().priceCents).toBe(240_000);
    expect(product.peekEvents()).toHaveLength(0);
  });

  it("rejects invalid slugs and non-positive or fractional prices", () => {
    expect(codeOf(() => Product.createDraft("prd_1", content({ slug: "Holt Sofa" }), NOW))).toBe("VALIDATION_FAILED");
    expect(codeOf(() => Product.createDraft("prd_1", content({ priceCents: 0 }), NOW))).toBe("VALIDATION_FAILED");
    expect(() => Product.createDraft("prd_1", content({ priceCents: 10.5 }), NOW)).toThrow(/whole number/);
  });

  it("refuses to publish a product without variants (409 CONFLICT)", () => {
    const product = Product.createDraft("prd_1", content(), NOW);
    expect(codeOf(() => product.publish(NOW))).toBe("CONFLICT");
    expect(product.status).toBe("draft");
  });

  it("publishes once: ProductPublished is raised and publishing again is a no-op", () => {
    const product = Product.createDraft("prd_1", content(), NOW);
    product.replaceVariants([variant("oatmeal", "HOLT-OAT-3")], NOW);
    expect(product.peekEvents()).toHaveLength(0);
    expect(product.publish(NOW)).toBe(true);
    expect(product.publish(later)).toBe(false);
    expect(product.pullEvents().map((e) => e.name)).toEqual(["ProductPublished"]);
    expect(product.toState().firstPublishedAt).toEqual(NOW);
  });

  it("archives a published product with ProductArchived and can be published again", () => {
    const product = publishedProduct();
    expect(product.archive(later)).toBe(true);
    expect(product.archive(later)).toBe(false);
    expect(product.pullEvents().map((e) => e.name)).toEqual(["ProductArchived"]);
    product.publish(later);
    expect(product.status).toBe("published");
    expect(product.toState().firstPublishedAt).toEqual(NOW);
  });

  it("revising a published product raises ProductUpdated with the changed fields only", () => {
    const product = publishedProduct();
    const changed = product.revise({ priceCents: 150_000, name: "Holt" }, later);
    expect(changed).toEqual(["priceCents"]);
    const [event] = product.pullEvents();
    expect(event.name).toBe("ProductUpdated");
    expect(event.payload).toEqual({ changed: ["priceCents"] });
    expect(product.toState().updatedAt).toEqual(later);
  });

  it("revising with identical values changes nothing and raises nothing", () => {
    const product = publishedProduct();
    expect(product.revise(content(), later)).toEqual([]);
    expect(product.peekEvents()).toHaveLength(0);
    expect(product.toState().updatedAt).toEqual(NOW);
  });

  it("drafts change silently; the slug is frozen once the product has been published", () => {
    const draft = Product.createDraft("prd_1", content(), NOW);
    expect(draft.revise({ slug: "holt-sofa-2" }, later)).toEqual(["slug"]);
    expect(draft.peekEvents()).toHaveLength(0);
    const product = publishedProduct();
    expect(codeOf(() => product.revise({ slug: "renamed" }, later))).toBe("CONFLICT");
  });

  it("variant lists need unique ids and SKUs and at least one variant", () => {
    const product = Product.createDraft("prd_1", content(), NOW);
    expect(codeOf(() => product.replaceVariants([], NOW))).toBe("VALIDATION_FAILED");
    expect(codeOf(() => product.replaceVariants([variant("a", "SKU-1"), variant("b", "SKU-1")], NOW))).toBe("VALIDATION_FAILED");
    expect(codeOf(() => product.replaceVariants([variant("a", "SKU-1"), variant("a", "SKU-2")], NOW))).toBe("VALIDATION_FAILED");
    expect(codeOf(() => product.replaceVariants([{ ...variant("a", "SKU-1"), colorFamily: "purple" as never }], NOW))).toBe("VALIDATION_FAILED");
  });

  it("replacing variants with an identical list is a no-op; a real change on a published product raises ProductUpdated(variants)", () => {
    const product = publishedProduct();
    const same = product.variants.map((v) => ({ id: v.id, sku: v.sku, label: v.label, colorFamily: v.colorFamily, material: v.material, swatchUrl: v.swatchUrl, imageUrl: v.imageUrl }));
    expect(product.replaceVariants(same, later)).toBe(false);
    expect(product.replaceVariants([...same, variant("moss", "PRDHOLT-MOS")], later)).toBe(true);
    expect(product.pullEvents()).toMatchObject([{ name: "ProductUpdated", payload: { changed: ["variants"] } }]);
  });

  it("keeps images ordered, refuses duplicates and renumbers after removal", () => {
    const product = publishedProduct();
    const image = (id: string) => ProductImage.create({ id, objectKey: `products/prd_holt/${id}-0000000.png`, url: `http://x/${id}.png`, alt: "Holt", position: 0, createdAt: NOW });
    product.addImage(image("img-a"), later);
    product.addImage(image("img-b"), later);
    expect(codeOf(() => product.addImage(image("img-a"), later))).toBe("CONFLICT");
    product.removeImage("img-a", later);
    expect(product.images.map((i) => [i.id, i.position])).toEqual([["img-b", 0]]);
    expect(codeOf(() => product.removeImage("nope", later))).toBe("NOT_FOUND");
  });

  it("records a review rating and announces the new rating summary", () => {
    const product = publishedProduct();
    product.recordRating(4, later);
    product.recordRating(5, later);
    expect(product.rating.count).toBe(2);
    expect(product.rating.average).toBe(4.5);
    expect(product.pullEvents().every((e) => e.name === "ProductUpdated")).toBe(true);
    const draft = Product.createDraft("prd_2", content({ slug: "draft" }), NOW);
    expect(codeOf(() => draft.recordRating(5, NOW))).toBe("NOT_FOUND");
  });
});
