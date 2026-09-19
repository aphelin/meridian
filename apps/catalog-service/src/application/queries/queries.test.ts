import { describe, expect, it } from "vitest";
import {
  clock,
  FakeCache,
  FakeReadModel,
  fakeOutbox,
  FakeTransactions,
  InMemoryProducts,
  InMemoryReferenceData,
  InMemoryWishlists,
  InMemoryReviews,
  publishedProduct,
} from "../../testing/in-memory";
import { AddToWishlistHandler, RemoveFromWishlistHandler, ReplaceWishlistHandler } from "../commands/wishlist.handlers";
import { SeedCatalogHandler } from "../commands/seed-catalog.handler";
import { ProductEventWriter } from "../services/product-event-writer";
import { StorefrontCatalogSeedSource } from "../../infrastructure/seed/catalog-seed-source";
import { GetCatalogSnapshotHandler, GetPricesHandler, ListProductsHandler } from "./catalog.handlers";

describe("catalog queries", () => {
  it("serves the snapshot cache-aside and reloads after invalidation", async () => {
    const readModel = new FakeReadModel(new InMemoryProducts(publishedProduct()));
    const cache = new FakeCache();
    const handler = new GetCatalogSnapshotHandler(readModel, cache);
    await handler.execute();
    await handler.execute();
    expect(readModel.snapshotLoads).toBe(1);
    await cache.invalidate();
    expect((await handler.execute()).products).toHaveLength(1);
    expect(readModel.snapshotLoads).toBe(2);
  });

  it("price lookups dedupe SKUs, omit unknown ones and cap the batch size", async () => {
    const readModel = new FakeReadModel();
    readModel.priceRows = [{ sku: "HOLT-CHA-3", slug: "holt-sofa", productName: "Holt", variantLabel: "Charcoal wool", variantId: "charcoal", priceCents: 240_000, status: "published", soldOut: false }];
    const handler = new GetPricesHandler(readModel);
    expect(await handler.execute({ skus: ["HOLT-CHA-3", "HOLT-CHA-3", "NOPE-1"] } as never)).toMatchObject([{ sku: "HOLT-CHA-3", soldOut: false }]);
    expect(await handler.execute({ skus: [] } as never)).toEqual([]);
    await expect(handler.execute({ skus: Array.from({ length: 101 }, (_, i) => `S-${i}`) } as never)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("product pages use opaque cursors and reject tampered ones", async () => {
    const products = new InMemoryProducts(...["a", "b", "c"].map((s) => publishedProduct(`prd_${s}`, { slug: `p-${s}` })));
    const handler = new ListProductsHandler(new FakeReadModel(products));
    const first = await handler.execute({ filter: { limit: 2 } } as never);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await handler.execute({ filter: { limit: 2, cursor: first.nextCursor } } as never);
    expect(second.items.map((p) => p.slug)).toEqual(["p-c"]);
    expect(second.nextCursor).toBeNull();
    await expect(handler.execute({ filter: { cursor: "not-a-cursor" } } as never)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("wishlist commands", () => {
  function setup() {
    const products = new InMemoryProducts(publishedProduct("prd_holt"), publishedProduct("prd_pil", { slug: "pil-lounge" }));
    const wishlists = new InMemoryWishlists();
    const readModel = new FakeReadModel(products, new InMemoryReviews(), wishlists);
    const tx = new FakeTransactions();
    return { products, wishlists, replace: new ReplaceWishlistHandler(tx, wishlists, products, readModel), add: new AddToWishlistHandler(tx, wishlists, products, readModel), remove: new RemoveFromWishlistHandler(tx, wishlists, readModel) };
  }

  it("wishlist replace (merge on sign-in) keeps published slugs in order and drops unknown ones", async () => {
    const ctx = setup();
    expect(await ctx.replace.execute({ userId: "u1", slugs: ["pil-lounge", "gone-product", "holt-sofa"] } as never)).toEqual({ slugs: ["pil-lounge", "holt-sofa"] });
  });

  it("wishlist add refuses unknown slugs with 404; remove is idempotent", async () => {
    const ctx = setup();
    await expect(ctx.add.execute({ userId: "u1", slug: "nope-nope" } as never)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await ctx.add.execute({ userId: "u1", slug: "holt-sofa" } as never);
    expect(await ctx.remove.execute({ userId: "u1", slug: "holt-sofa" } as never)).toEqual({ slugs: [] });
    expect(await ctx.remove.execute({ userId: "u1", slug: "holt-sofa" } as never)).toEqual({ slugs: [] });
  });
});

describe("catalog seeding", () => {
  it("seeds the storefront catalog, publishing each product once; re-seeding publishes nothing", async () => {
    const products = new InMemoryProducts();
    const referenceData = new InMemoryReferenceData([], []);
    const outbox = fakeOutbox();
    const cache = new FakeCache();
    const handler = new SeedCatalogHandler(new FakeTransactions(), new StorefrontCatalogSeedSource(), referenceData, products, new ProductEventWriter(outbox, referenceData), cache, clock());
    const first = await handler.execute();
    expect(first.products).toMatchObject({ total: 29, created: 29 });
    expect(first.categories).toEqual({ total: 4, changed: 4 });
    expect(outbox.rows.filter((r) => r.name === "ProductPublished")).toHaveLength(29);
    expect(outbox.rows.every((r) => r.aggregate.id === r.payload.product.productId)).toBe(true);
    const second = await handler.execute();
    expect(second.products).toMatchObject({ unchanged: 29, created: 0, updated: 0 });
    expect(outbox.rows).toHaveLength(29);
  });

  it("re-seeding restores a changed seed price with ProductUpdated and keeps an archived product archived", async () => {
    const products = new InMemoryProducts();
    const referenceData = new InMemoryReferenceData([], []);
    const outbox = fakeOutbox();
    const handler = new SeedCatalogHandler(new FakeTransactions(), new StorefrontCatalogSeedSource(), referenceData, products, new ProductEventWriter(outbox, referenceData), new FakeCache(), clock());
    await handler.execute();
    const holt = (await products.findBySlug("holt-sofa"))!;
    holt.revise({ priceCents: 1 }, new Date());
    holt.pullEvents();
    await products.save(holt);
    const kiln = (await products.findBySlug("sideboard-kiln"))!;
    kiln.archive(new Date());
    await products.save(kiln);
    outbox.rows.length = 0;
    const result = await handler.execute();
    expect(result.products.updated).toBe(1);
    expect(outbox.rows).toMatchObject([{ name: "ProductUpdated", payload: { changed: ["priceCents"], product: { slug: "holt-sofa", priceCents: 119_000 } } }]);
    expect((await products.findBySlug("sideboard-kiln"))?.status).toBe("archived");
  });
});
