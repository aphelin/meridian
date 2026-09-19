import { beforeEach, describe, expect, it } from "vitest";
import { type CheckoutFixture, checkoutFixture } from "../../test-support/checkout-fixture";
import { GetCartQuery } from "../queries/get-cart.query";
import { ClearCartCommand } from "./clear-cart.command";
import { MergeCartCommand } from "./merge-cart.command";
import { PurgeIdleCartsCommand } from "./purge-idle-carts.command";
import { ReplaceCartItemsCommand } from "./replace-cart-items.command";

let f: CheckoutFixture;
beforeEach(() => {
  f = checkoutFixture();
});

describe("cart command handlers", () => {
  it("cart items are priced from the catalog and the guest cart is persisted", async () => {
    const cart = await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, null, [{ sku: "KITE-OCH", variantId: "ochre", qty: 2 }]));
    expect(cart).toMatchObject({ userId: null, lines: [{ sku: "KITE-OCH", qty: 2, unitPriceCents: 54_000, slug: "kite-lamp" }] });
    expect((await f.handlers.getCart.execute(new GetCartQuery(null, cart.id))).lines).toHaveLength(1);
    expect(f.catalog.calls).toEqual([["KITE-OCH"]]);
  });

  it("cart rejects unknown SKUs, wrong variants and archived products", async () => {
    await expect(f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, null, [{ sku: "NOPE", variantId: "x", qty: 1 }]))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, null, [{ sku: "KITE-OCH", variantId: "red", qty: 1 }]))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, null, [{ sku: "OLD-1", variantId: "only", qty: 1 }]))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("cart refuses a sold-out product with OUT_OF_STOCK and details.sku, leaving the cart unchanged (amendment 1p)", async () => {
    const cart = await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, null, [{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }]));
    f.catalog.soldOut.add("HOLT-CHA-3");
    await expect(
      f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, cart.id, [{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }, { sku: "HOLT-CHA-3", variantId: "charcoal", qty: 1 }])),
    ).rejects.toMatchObject({ code: "OUT_OF_STOCK", details: { sku: "HOLT-CHA-3" } });
    expect((await f.handlers.getCart.execute(new GetCartQuery(null, cart.id))).lines.map((l) => l.sku)).toEqual(["KITE-OCH"]);
  });

  it("cart id of a user's cart never exposes that cart to a guest", async () => {
    const userCart = await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand("user-1", null, [{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }]));
    const asGuest = await f.handlers.getCart.execute(new GetCartQuery(null, userCart.id));
    expect(asGuest.id).not.toBe(userCart.id);
    expect(asGuest.lines).toHaveLength(0);
  });

  it("cart ids chosen by a client are only honoured when they are random UUIDs", async () => {
    const uuid = "0b9c6f7e-3a52-4c1e-9d7a-2f1e8c4b5a60";
    expect((await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, uuid, [{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }]))).id).toBe(uuid);
    expect((await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, "guessable-cart", [{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }]))).id).not.toBe("guessable-cart");
  });

  it("merge moves the guest cart into the user cart and empties the guest cart", async () => {
    const guest = await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, null, [{ sku: "HOLT-CHA-3", variantId: "charcoal", qty: 1 }, { sku: "KITE-OCH", variantId: "ochre", qty: 2 }]));
    await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand("user-1", null, [{ sku: "KITE-OCH", variantId: "ochre", qty: 19 }]));
    const merged = await f.handlers.mergeCart.execute(new MergeCartCommand("user-1", guest.id));
    expect(merged.userId).toBe("user-1");
    expect(merged.lines.map((l) => [l.sku, l.qty])).toEqual([["KITE-OCH", 20], ["HOLT-CHA-3", 1]]);
    expect((await f.handlers.getCart.execute(new GetCartQuery(null, guest.id))).lines).toHaveLength(0);
  });

  it("merge without a guest cart returns the (new) user cart", async () => {
    const merged = await f.handlers.mergeCart.execute(new MergeCartCommand("user-2", null));
    expect(merged).toMatchObject({ userId: "user-2", lines: [] });
    expect(await f.carts.findByUserId("user-2")).not.toBeNull();
  });

  it("cart clear empties the cart and idle guest carts are purged after 30 days", async () => {
    const guest = await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(null, null, [{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }]));
    await f.handlers.clearCart.execute(new ClearCartCommand(null, guest.id));
    expect((await f.carts.findById(guest.id))!.isEmpty).toBe(true);
    await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand("user-1", null, [{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }]));
    f.clock.advance(31 * 86_400_000);
    expect(await f.handlers.purgeCarts.execute(new PurgeIdleCartsCommand())).toEqual({ purged: 1 });
    expect(await f.carts.findByUserId("user-1")).not.toBeNull();
  });
});
