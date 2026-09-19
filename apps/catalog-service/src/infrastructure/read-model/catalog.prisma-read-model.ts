import type { CatalogSnapshotDto, CategoryDto, ColorFamily, MaterialDto, ProductDto, ProductStatus, ReviewDto } from "@meridian/contracts";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma";
import {
  CatalogReadModel,
  type ProductListFilter,
  type ProductListSlice,
  type ReviewPosition,
  type ReviewSlice,
  type SkuPriceDto,
} from "../../application/ports/catalog-read-model";
import { RatingSummary } from "../../domain/product/rating-summary";
import { PrismaService } from "../persistence/prisma.service";

const productParts = { variants: { orderBy: { position: "asc" } }, images: { orderBy: { position: "asc" } } } satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productParts }>;
type ReviewRow = Prisma.ReviewGetPayload<object>;

export function toProductDto(row: ProductRow): ProductDto {
  const rating = RatingSummary.of([row.rating1, row.rating2, row.rating3, row.rating4, row.rating5]);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    story: row.story,
    categoryId: row.categoryId,
    materials: row.materials,
    priceCents: row.priceCents,
    currency: "EUR",
    status: row.status as ProductStatus,
    featured: row.featured,
    soldOut: row.soldOut,
    heroImageUrl: row.heroImageUrl,
    detailImageUrl: row.detailImageUrl,
    variants: row.variants.map((v) => ({
      id: v.variantId,
      sku: v.sku,
      label: v.label,
      colorFamily: v.colorFamily as ColorFamily,
      material: v.material,
      swatchUrl: v.swatchUrl,
      imageUrl: v.imageUrl,
      position: v.position,
    })),
    images: row.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, position: i.position })),
    details: { widthCm: row.widthCm, depthCm: row.depthCm, heightCm: row.heightCm, weightKg: row.weightKg, construction: row.construction, care: row.care },
    rating: { average: rating.average, count: rating.count, distribution: rating.distribution },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toReviewDto(row: ReviewRow): ReviewDto {
  return { id: row.id, rating: row.rating, title: row.title, body: row.body, authorName: row.authorName, verifiedPurchase: true, createdAt: row.createdAt.toISOString() };
}

@Injectable()
export class CatalogPrismaReadModel extends CatalogReadModel {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async snapshot(): Promise<CatalogSnapshotDto> {
    const [categories, materials, products] = await Promise.all([
      this.categories(),
      this.materials(),
      this.prisma.product.findMany({ where: { status: "published" }, include: productParts, orderBy: { seq: "asc" } }),
    ]);
    return { categories, materials, products: products.map(toProductDto) };
  }

  categories(): Promise<CategoryDto[]> {
    return this.prisma.category.findMany({ orderBy: { position: "asc" }, select: { id: true, label: true, blurb: true, coverImageUrl: true, position: true } });
  }

  async materials(): Promise<MaterialDto[]> {
    return this.prisma.material.findMany({ orderBy: { position: "asc" }, select: { id: true, label: true, swatchUrl: true } });
  }

  async listProducts(filter: ProductListFilter): Promise<ProductListSlice> {
    const where: Prisma.ProductWhereInput = { status: { in: filter.statuses } };
    if (filter.categoryId !== undefined) where.categoryId = filter.categoryId;
    if (filter.featured !== undefined) where.featured = filter.featured;
    if (filter.afterSeq !== undefined) where.seq = filter.order === "asc" ? { gt: filter.afterSeq } : { lt: filter.afterSeq };
    if (filter.q) {
      const contains = { contains: filter.q, mode: "insensitive" as const };
      where.OR = [{ name: contains }, { slug: contains }, { kind: contains }, { variants: { some: { sku: contains } } }];
    }
    const rows = await this.prisma.product.findMany({ where, include: productParts, orderBy: { seq: filter.order }, take: filter.limit + 1 });
    const page = rows.slice(0, filter.limit);
    return { items: page.map(toProductDto), nextSeq: rows.length > filter.limit ? page[page.length - 1].seq : null };
  }

  async productBySlug(slug: string): Promise<ProductDto | null> {
    const row = await this.prisma.product.findUnique({ where: { slug }, include: productParts });
    return row ? toProductDto(row) : null;
  }

  async productById(id: string): Promise<ProductDto | null> {
    const row = await this.prisma.product.findUnique({ where: { id }, include: productParts });
    return row ? toProductDto(row) : null;
  }

  async prices(skus: readonly string[]): Promise<SkuPriceDto[]> {
    const rows = await this.prisma.productVariant.findMany({
      where: { sku: { in: [...skus] } },
      include: { product: { select: { slug: true, name: true, priceCents: true, status: true, soldOut: true } } },
    });
    const bySku = new Map(rows.map((r) => [r.sku, r]));
    return skus.flatMap((sku) => {
      const row = bySku.get(sku);
      if (!row) return [];
      return [{ sku, slug: row.product.slug, productName: row.product.name, variantLabel: row.label, variantId: row.variantId, priceCents: row.product.priceCents, status: row.product.status as ProductStatus, soldOut: row.product.soldOut }];
    });
  }

  async reviews(productId: string, after: ReviewPosition | null, limit: number): Promise<ReviewSlice> {
    const where: Prisma.ReviewWhereInput = { productId };
    if (after) {
      const at = new Date(after.createdAt);
      where.OR = [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: after.id } }];
    }
    const rows = await this.prisma.review.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { items: page.map(toReviewDto), next: rows.length > limit && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null };
  }

  async review(id: string): Promise<ReviewDto | null> {
    const row = await this.prisma.review.findUnique({ where: { id } });
    return row ? toReviewDto(row) : null;
  }

  async wishlist(userId: string): Promise<string[]> {
    const items = await this.prisma.wishlistItem.findMany({ where: { userId }, orderBy: { position: "asc" }, select: { slug: true } });
    if (!items.length) return [];
    const published = await this.prisma.product.findMany({ where: { slug: { in: items.map((i) => i.slug) }, status: "published" }, select: { slug: true } });
    const visible = new Set(published.map((p) => p.slug));
    return items.map((i) => i.slug).filter((slug) => visible.has(slug));
  }
}
