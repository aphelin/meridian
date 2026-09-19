import type { ColorFamily, ProductStatus } from "@meridian/contracts";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma";
import { Product } from "../../domain/product/product";
import { ProductDetails } from "../../domain/product/product-details";
import { ProductImage } from "../../domain/product/product-image";
import { ProductVariant } from "../../domain/product/product-variant";
import { type LoadOptions, ProductRepository } from "../../domain/product/product.repository";
import { RatingSummary } from "../../domain/product/rating-summary";
import type { Transaction } from "../../domain/shared/transaction";
import { db } from "./prisma-transaction-runner";
import { PrismaService } from "./prisma.service";

const withParts = { variants: { orderBy: { position: "asc" } }, images: { orderBy: { position: "asc" } } } satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof withParts }>;

function toDomain(row: ProductRow): Product {
  return Product.restore({
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    story: row.story,
    categoryId: row.categoryId,
    materials: row.materials,
    priceCents: row.priceCents,
    featured: row.featured,
    soldOut: row.soldOut,
    heroImageUrl: row.heroImageUrl,
    detailImageUrl: row.detailImageUrl,
    details: ProductDetails.create({ widthCm: row.widthCm, depthCm: row.depthCm, heightCm: row.heightCm, weightKg: row.weightKg, construction: row.construction, care: row.care }),
    status: row.status as ProductStatus,
    variants: row.variants.map((v) =>
      ProductVariant.create({ id: v.variantId, sku: v.sku, label: v.label, colorFamily: v.colorFamily as ColorFamily, material: v.material, swatchUrl: v.swatchUrl, imageUrl: v.imageUrl }),
    ),
    images: row.images.map((i) => ProductImage.create({ id: i.id, objectKey: i.objectKey, url: i.url, alt: i.alt, position: i.position, createdAt: i.createdAt })),
    rating: RatingSummary.of([row.rating1, row.rating2, row.rating3, row.rating4, row.rating5]),
    firstPublishedAt: row.firstPublishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

@Injectable()
export class ProductPrismaRepository extends ProductRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: Transaction, options: LoadOptions = {}): Promise<Product | null> {
    const client = db(this.prisma, tx);
    if (options.forUpdate) await client.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`;
    const row = await client.product.findUnique({ where: { id }, include: withParts });
    return row ? toDomain(row) : null;
  }

  async findBySlug(slug: string, tx?: Transaction, options: LoadOptions = {}): Promise<Product | null> {
    const client = db(this.prisma, tx);
    if (options.forUpdate) await client.$queryRaw`SELECT "id" FROM "Product" WHERE "slug" = ${slug} FOR UPDATE`;
    const row = await client.product.findUnique({ where: { slug }, include: withParts });
    return row ? toDomain(row) : null;
  }

  async slugOwner(slug: string, tx?: Transaction): Promise<string | null> {
    const row = await db(this.prisma, tx).product.findUnique({ where: { slug }, select: { id: true } });
    return row?.id ?? null;
  }

  async skuOwners(skus: readonly string[], tx?: Transaction): Promise<Map<string, string>> {
    if (!skus.length) return new Map();
    const rows = await db(this.prisma, tx).productVariant.findMany({ where: { sku: { in: [...skus] } }, select: { sku: true, productId: true } });
    return new Map(rows.map((r) => [r.sku, r.productId]));
  }

  async publishedSlugs(slugs: readonly string[], tx?: Transaction): Promise<Set<string>> {
    if (!slugs.length) return new Set();
    const rows = await db(this.prisma, tx).product.findMany({ where: { slug: { in: [...slugs] }, status: "published" }, select: { slug: true } });
    return new Set(rows.map((r) => r.slug));
  }

  async publishedIdsInCategory(categoryId: string, tx?: Transaction): Promise<string[]> {
    const rows = await db(this.prisma, tx).product.findMany({ where: { categoryId, status: "published" }, select: { id: true }, orderBy: { seq: "asc" } });
    return rows.map((r) => r.id);
  }

  async lockCatalog(tx: Transaction): Promise<void> {
    await db(this.prisma, tx).$queryRaw`SELECT pg_advisory_xact_lock(hashtext('catalog-service:catalog'))::text AS locked`;
  }

  async save(product: Product, tx: Transaction): Promise<void> {
    const client = db(this.prisma, tx);
    const s = product.toState();
    const [r1, r2, r3, r4, r5] = s.rating.distribution;
    const fields = {
      slug: s.slug,
      name: s.name,
      kind: s.kind,
      story: s.story,
      categoryId: s.categoryId,
      materials: s.materials,
      priceCents: s.priceCents,
      currency: "EUR",
      status: s.status,
      featured: s.featured,
      soldOut: s.soldOut,
      heroImageUrl: s.heroImageUrl,
      detailImageUrl: s.detailImageUrl,
      widthCm: s.details.widthCm,
      depthCm: s.details.depthCm,
      heightCm: s.details.heightCm,
      weightKg: s.details.weightKg,
      construction: s.details.construction,
      care: s.details.care,
      rating1: r1,
      rating2: r2,
      rating3: r3,
      rating4: r4,
      rating5: r5,
      firstPublishedAt: s.firstPublishedAt,
      updatedAt: s.updatedAt,
    };
    await client.product.upsert({ where: { id: s.id }, create: { id: s.id, createdAt: s.createdAt, ...fields }, update: fields });
    // Variants and images are part of the aggregate: replace them wholesale inside the same transaction.
    await client.productVariant.deleteMany({ where: { productId: s.id } });
    if (s.variants.length) {
      await client.productVariant.createMany({
        data: s.variants.map((v, position) => ({ productId: s.id, variantId: v.id, sku: v.sku, label: v.label, colorFamily: v.colorFamily, material: v.material, swatchUrl: v.swatchUrl, imageUrl: v.imageUrl, position })),
      });
    }
    await client.productImage.deleteMany({ where: { productId: s.id } });
    if (s.images.length) {
      await client.productImage.createMany({
        data: s.images.map((i) => ({ id: i.id, productId: s.id, objectKey: i.objectKey, url: i.url, alt: i.alt, position: i.position, createdAt: i.createdAt })),
      });
    }
  }
}
