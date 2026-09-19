import { describe, expect, it } from "vitest";
import { Cart, type CartLine } from "./cart";

const t0 = new Date("2026-09-01T00:00:00Z");
const line = (sku: string, qty: number, price = 1000): CartLine => ({ sku, variantId: "v", slug: sku.toLowerCase(), qty, unitPriceCents: price });

describe("Cart aggregate", () => {
  it("cart replaces its lines and records the update time", () => {
    const cart = Cart.open("cart-1", null, t0);
    const later = new Date("2026-09-02T00:00:00Z");
    cart.replaceLines([line("A", 1), line("B", 2)], later);
    expect(cart.lines.map((l) => [l.sku, l.qty])).toEqual([["A", 1], ["B", 2]]);
    expect(cart.updatedAt).toEqual(later);
    expect(cart.isGuest).toBe(true);
  });

  it("cart rejects quantities above 20 and duplicate SKUs", () => {
    const cart = Cart.open("cart-1", null, t0);
    expect(() => cart.replaceLines([line("A", 21)], t0)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => cart.replaceLines([line("A", 1), line("A", 2)], t0)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => cart.replaceLines([line("A", 0)], t0)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("cart merge sums quantities per SKU, caps at 20, appends new lines and empties the guest cart", () => {
    const user = Cart.open("user-cart", "user-1", t0);
    user.replaceLines([line("KITE", 19)], t0);
    const guest = Cart.open("guest-cart", null, t0);
    guest.replaceLines([line("HOLT", 1), line("KITE", 2)], t0);
    user.mergeFrom(guest, t0);
    expect(user.lines.map((l) => [l.sku, l.qty])).toEqual([["KITE", 20], ["HOLT", 1]]);
    expect(guest.isEmpty).toBe(true);
  });

  it("cart merge refuses to absorb another user's cart or to merge into a guest cart", () => {
    const user = Cart.open("user-cart", "user-1", t0);
    expect(() => user.mergeFrom(Cart.open("other", "user-2", t0), t0)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => Cart.open("g1", null, t0).mergeFrom(Cart.open("g2", null, t0), t0)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("cart idle purge applies to guest carts untouched for 30 days only", () => {
    const now = new Date(t0.getTime() + 30 * 86_400_000);
    expect(Cart.open("g", null, t0).isIdleGuest(now)).toBe(true);
    expect(Cart.open("g", null, t0).isIdleGuest(new Date(now.getTime() - 1))).toBe(false);
    expect(Cart.open("u", "user-1", t0).isIdleGuest(now)).toBe(false);
  });
});
