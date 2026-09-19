import { beforeEach, describe, expect, it } from "vitest";
import {
  clock,
  content,
  FakeCache,
  FakeReadModel,
  fakeOutbox,
  FakeStorage,
  FakeTransactions,
  InMemoryProducts,
  InMemoryReferenceData,
  publishedProduct,
  variant,
} from "../../testing/in-memory";
import { ProductEventWriter } from "../services/product-event-writer";
import { ProductWrites } from "../services/product-writes";
import { ArchiveProductHandler } from "./archive-product.handler";
import { AttachProductImageHandler } from "./attach-product-image.handler";
import { CreateImageUploadHandler } from "./create-image-upload.handler";
import { CreateProductCommand } from "./create-product.command";
import { CreateProductHandler } from "./create-product.handler";
import { PublishProductHandler } from "./publish-product.handler";
import { ReplaceVariantsHandler } from "./replace-variants.handler";
import { UpdateProductHandler } from "./update-product.handler";

function setup(...existing: ReturnType<typeof publishedProduct>[]) {
  const transactions = new FakeTransactions();
  const products = new InMemoryProducts(...existing);
  const referenceData = new InMemoryReferenceData();
  const outbox = fakeOutbox();
  const cache = new FakeCache();
  const readModel = new FakeReadModel(products);
  const storage = new FakeStorage();
  const events = new ProductEventWriter(outbox, referenceData);
  const writes = new ProductWrites(transactions, products, events, cache, readModel);
  return { transactions, products, referenceData, outbox, cache, readModel, storage, events, writes, clock: clock() };
}

describe("admin product lifecycle (application)", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup(publishedProduct("prd_holt"));
  });

  it("creates a draft without publishing anything and refuses a slug in use (409)", async () => {
    const handler = new CreateProductHandler(ctx.transactions, ctx.products, ctx.referenceData, ctx.events, ctx.writes, ctx.clock);
    const dto = await handler.execute(new CreateProductCommand(content({ slug: "probe-chair" }) as never));
    expect(dto.status).toBe("draft");
    expect(ctx.outbox.rows).toHaveLength(0);
    await expect(handler.execute(new CreateProductCommand(content() as never))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses unknown categories and materials with 400", async () => {
    const handler = new CreateProductHandler(ctx.transactions, ctx.products, ctx.referenceData, ctx.events, ctx.writes, ctx.clock);
    await expect(handler.execute(new CreateProductCommand(content({ slug: "x", categoryId: "garden" }) as never))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(handler.execute(new CreateProductCommand(content({ slug: "x", materials: ["marble"] }) as never))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("publish writes one ProductPublished keyed by product id with the category label, and busts the cache", async () => {
    const create = new CreateProductHandler(ctx.transactions, ctx.products, ctx.referenceData, ctx.events, ctx.writes, ctx.clock);
    const draft = await create.execute(new CreateProductCommand(content({ slug: "probe-chair" }) as never));
    const publish = new PublishProductHandler(ctx.writes, ctx.clock);
    await expect(publish.execute({ productId: draft.id } as never)).rejects.toMatchObject({ code: "CONFLICT" });
    await new ReplaceVariantsHandler(ctx.writes, ctx.products, ctx.referenceData, ctx.clock).execute({ productId: draft.id, variants: [variant("natural", "PROBE-1", "oak")] } as never);
    const before = ctx.cache.invalidations;
    const dto = await publish.execute({ productId: draft.id } as never);
    expect(dto.status).toBe("published");
    expect(ctx.outbox.rows.map((r) => r.name)).toEqual(["ProductPublished"]);
    expect(ctx.outbox.rows[0].aggregate).toEqual({ type: "Product", id: draft.id });
    expect(ctx.outbox.rows[0].payload.product).toMatchObject({ productId: draft.id, categoryLabel: "Seating", variants: [{ sku: "PROBE-1", variantId: "natural" }] });
    expect(ctx.cache.invalidations).toBe(before + 1);
    await publish.execute({ productId: draft.id } as never);
    expect(ctx.outbox.rows).toHaveLength(1);
  });

  it("replacing variants with a SKU owned by another product fails with 409 and changes nothing", async () => {
    const create = new CreateProductHandler(ctx.transactions, ctx.products, ctx.referenceData, ctx.events, ctx.writes, ctx.clock);
    const draft = await create.execute(new CreateProductCommand(content({ slug: "probe-chair" }) as never));
    const handler = new ReplaceVariantsHandler(ctx.writes, ctx.products, ctx.referenceData, ctx.clock);
    await expect(handler.execute({ productId: draft.id, variants: [variant("x", "PRDHOLT-CHA")] } as never)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await ctx.products.findById(draft.id))?.variants).toHaveLength(0);
  });

  it("a price change on a published product writes ProductUpdated with changed priceCents", async () => {
    await new UpdateProductHandler(ctx.writes, ctx.products, ctx.referenceData, ctx.clock).execute({ productId: "prd_holt", patch: { priceCents: 15_000 } } as never);
    expect(ctx.outbox.rows).toHaveLength(1);
    expect(ctx.outbox.rows[0]).toMatchObject({ name: "ProductUpdated", payload: { changed: ["priceCents"], product: { priceCents: 15_000 } } });
  });

  it("toggling soldOut on a published product writes ProductUpdated with changed soldOut and the flag in the snapshot", async () => {
    await new UpdateProductHandler(ctx.writes, ctx.products, ctx.referenceData, ctx.clock).execute({ productId: "prd_holt", patch: { soldOut: true } } as never);
    expect(ctx.outbox.rows).toHaveLength(1);
    expect(ctx.outbox.rows[0]).toMatchObject({ name: "ProductUpdated", payload: { changed: ["soldOut"], product: { soldOut: true } } });
  });

  it("archive writes ProductArchived with id and slug; unknown products are 404", async () => {
    const handler = new ArchiveProductHandler(ctx.writes, ctx.clock);
    const dto = await handler.execute({ productId: "prd_holt" } as never);
    expect(dto.status).toBe("archived");
    expect(ctx.outbox.rows).toEqual([{ name: "ProductArchived", aggregate: { type: "Product", id: "prd_holt" }, payload: { productId: "prd_holt", slug: "holt-sofa" } }]);
    await expect(handler.execute({ productId: "nope" } as never)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("image upload tickets are presigned for the product prefix; confirming checks the stored object", async () => {
    const ticket = await new CreateImageUploadHandler(ctx.products, ctx.storage).execute({ productId: "prd_holt", contentType: "image/png", fileName: "a.png" } as never);
    expect(ticket.objectKey).toMatch(/^products\/prd_holt\/[0-9a-f-]+\.png$/);
    const attach = new AttachProductImageHandler(ctx.writes, ctx.products, ctx.storage, ctx.clock);
    await expect(attach.execute({ productId: "prd_holt", objectKey: ticket.objectKey, alt: "Holt" } as never)).rejects.toMatchObject({ code: "NOT_FOUND" });
    ctx.storage.objects.set(ticket.objectKey, { contentType: "image/png", sizeBytes: 64 });
    const image = await attach.execute({ productId: "prd_holt", objectKey: ticket.objectKey, alt: "Holt" } as never);
    expect(image).toMatchObject({ url: ticket.publicUrl, alt: "Holt", position: 0 });
    expect(ctx.outbox.rows.at(-1)).toMatchObject({ name: "ProductUpdated", payload: { changed: ["images"] } });
  });

  it("oversized uploads are rejected and deleted from storage", async () => {
    const key = "products/prd_holt/0f1e2d3c-aaaa.png";
    ctx.storage.objects.set(key, { contentType: "image/png", sizeBytes: 9 * 1024 * 1024 });
    const attach = new AttachProductImageHandler(ctx.writes, ctx.products, ctx.storage, ctx.clock);
    await expect(attach.execute({ productId: "prd_holt", objectKey: key, alt: "Big" } as never)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(ctx.storage.deleted).toEqual([key]);
  });
});
