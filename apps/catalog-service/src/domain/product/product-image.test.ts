import { describe, expect, it } from "vitest";
import { assertImageKeyFor, assertUploadedImage, imageObjectKey, MAX_IMAGE_BYTES } from "./product-image";
import { assertSkusAvailable } from "./sku-policy";

describe("image upload policy", () => {
  it("builds keys under the product prefix with an extension per content type and refuses non-images", () => {
    expect(imageObjectKey("prd_1", "0f1e2d3c-aaaa", "image/png")).toBe("products/prd_1/0f1e2d3c-aaaa.png");
    expect(imageObjectKey("prd_1", "0f1e2d3c-aaaa", "image/jpeg")).toMatch(/\.jpg$/);
    expect(() => imageObjectKey("prd_1", "0f1e2d3c-aaaa", "application/pdf")).toThrow(/JPEG, PNG or WebP/);
  });

  it("only accepts keys issued for the same product", () => {
    expect(() => assertImageKeyFor("prd_1", "products/prd_1/0f1e2d3c-aaaa.png")).not.toThrow();
    expect(() => assertImageKeyFor("prd_1", "products/prd_2/0f1e2d3c-aaaa.png")).toThrow(/not uploaded for this product/);
    expect(() => assertImageKeyFor("prd_1", "products/prd_1/../../secrets.png")).toThrow();
  });

  it("checks the stored object's type and the 8 MB limit", () => {
    expect(() => assertUploadedImage({ contentType: "image/webp", sizeBytes: 1024 })).not.toThrow();
    expect(() => assertUploadedImage({ contentType: "text/html", sizeBytes: 10 })).toThrow();
    expect(() => assertUploadedImage({ contentType: "image/png", sizeBytes: MAX_IMAGE_BYTES + 1 })).toThrow(/8 MB/);
  });
});

describe("SKU ownership", () => {
  it("refuses a variant SKU owned by another product with 409 and allows the product's own SKUs", () => {
    const owners = new Map([["HOLT-CHA-3", "prd_holt"]]);
    expect(() => assertSkusAvailable("prd_holt", ["HOLT-CHA-3"], owners)).not.toThrow();
    expect(() => assertSkusAvailable("prd_other", ["HOLT-CHA-3", "NEW-1"], owners)).toThrow(expect.objectContaining({ code: "CONFLICT" }));
  });
});
