import { Injectable } from "@nestjs/common";
import { SearchDocument, SearchDocumentRepository, type ChangeResult } from "../../domain";
import type { ProductDocument } from "../../generated/prisma";
import { PrismaService } from "../prisma.service";
import { SEARCH_VECTOR_SQL } from "./search-sql";

const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 };

@Injectable()
export class PrismaSearchDocumentRepository extends SearchDocumentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  change(productId: string, change: (current: SearchDocument | null) => SearchDocument | null): Promise<ChangeResult> {
    return this.prisma.$transaction(async (tx) => {
      // Serialises writers of one product, including the very first insert (a row lock needs an existing row).
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`search-document:${productId}`}))`;
      const row = await tx.productDocument.findUnique({ where: { productId } });
      const next = change(row ? toDomain(row) : null);
      if (!next) return "unchanged";
      const doc = next.toProps();

      // A slug can move between products (catalog frees it on archive); the newer fact keeps it.
      const holder = await tx.productDocument.findUnique({ where: { slug: doc.slug }, select: { productId: true, lastEventAt: true } });
      if (holder && holder.productId !== doc.productId) {
        if (holder.lastEventAt.getTime() > doc.lastEventAt.getTime()) return "unchanged";
        await tx.productDocument.delete({ where: { productId: holder.productId } });
      }

      const data = {
        slug: doc.slug,
        name: doc.name,
        kind: doc.kind,
        story: doc.story,
        categoryId: doc.categoryId,
        categoryLabel: doc.categoryLabel,
        materials: doc.materials,
        colors: doc.colors,
        skus: doc.skus,
        variantLabels: doc.variantLabels,
        priceCents: doc.priceCents,
        featured: doc.featured,
        soldOut: doc.soldOut,
        heroImageUrl: doc.heroImageUrl,
        ratingAvg: doc.ratingAvg,
        ratingCount: doc.ratingCount,
        status: doc.status,
        productCreatedAt: doc.productCreatedAt,
        productUpdatedAt: doc.productUpdatedAt,
        lastEventId: doc.lastEventId,
        lastEventAt: doc.lastEventAt,
        indexedAt: new Date(),
      };
      await tx.productDocument.upsert({ where: { productId }, create: { productId, ...data }, update: data });
      await tx.$executeRaw`UPDATE "ProductDocument" SET "searchVector" = ${SEARCH_VECTOR_SQL} WHERE "productId" = ${productId}`;
      return "written";
    }, TX_OPTIONS);
  }
}

function toDomain(row: ProductDocument): SearchDocument {
  return SearchDocument.restore({
    productId: row.productId,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    story: row.story,
    categoryId: row.categoryId,
    categoryLabel: row.categoryLabel,
    materials: row.materials,
    colors: row.colors,
    skus: row.skus,
    variantLabels: row.variantLabels,
    priceCents: row.priceCents,
    featured: row.featured,
    soldOut: row.soldOut,
    heroImageUrl: row.heroImageUrl,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    status: row.status === "published" || row.status === "draft" ? row.status : "archived",
    productCreatedAt: row.productCreatedAt,
    productUpdatedAt: row.productUpdatedAt,
    lastEventId: row.lastEventId,
    lastEventAt: row.lastEventAt,
  });
}
