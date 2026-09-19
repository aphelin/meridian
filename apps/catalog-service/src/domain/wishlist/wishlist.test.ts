import { describe, expect, it } from "vitest";
import { MAX_WISHLIST_ITEMS, Wishlist } from "./wishlist";

describe("Wishlist aggregate", () => {
  it("wishlist add keeps order and ignores duplicates", () => {
    const wishlist = Wishlist.empty("u1");
    expect(wishlist.add("holt-sofa")).toBe(true);
    expect(wishlist.add("pil-lounge")).toBe(true);
    expect(wishlist.add("holt-sofa")).toBe(false);
    expect(wishlist.slugs).toEqual(["holt-sofa", "pil-lounge"]);
  });

  it("wishlist remove and replace (merge) collapse duplicates and validate slugs", () => {
    const wishlist = Wishlist.restore("u1", ["holt-sofa", "pil-lounge"]);
    expect(wishlist.remove("pil-lounge")).toBe(true);
    expect(wishlist.remove("pil-lounge")).toBe(false);
    wishlist.replace(["kite-lamp", "holt-sofa", "kite-lamp"]);
    expect(wishlist.slugs).toEqual(["kite-lamp", "holt-sofa"]);
    expect(() => wishlist.replace(["Not A Slug"])).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("wishlist size is bounded", () => {
    const wishlist = Wishlist.restore("u1", Array.from({ length: MAX_WISHLIST_ITEMS }, (_, i) => `p-${i}`));
    expect(() => wishlist.add("one-more")).toThrow(expect.objectContaining({ code: "CONFLICT" }));
  });
});
