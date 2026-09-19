import { Injectable } from "@nestjs/common";
import type { Transaction } from "../../domain/shared/transaction";
import { Wishlist } from "../../domain/wishlist/wishlist";
import { WishlistRepository } from "../../domain/wishlist/wishlist.repository";
import { db } from "./prisma-transaction-runner";
import { PrismaService } from "./prisma.service";

@Injectable()
export class WishlistPrismaRepository extends WishlistRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async loadForUpdate(userId: string, tx: Transaction): Promise<Wishlist> {
    const client = db(this.prisma, tx);
    // A wishlist may have no rows yet, so lock the user's list itself rather than rows.
    const key = `catalog-service:wishlist:${userId}`;
    await client.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
    const rows = await client.wishlistItem.findMany({ where: { userId }, orderBy: { position: "asc" }, select: { slug: true } });
    return rows.length ? Wishlist.restore(userId, rows.map((r) => r.slug)) : Wishlist.empty(userId);
  }

  async save(wishlist: Wishlist, tx: Transaction): Promise<void> {
    const client = db(this.prisma, tx);
    const existing = await client.wishlistItem.findMany({ where: { userId: wishlist.userId }, select: { slug: true, addedAt: true } });
    const addedAt = new Map(existing.map((row) => [row.slug, row.addedAt]));
    const now = new Date();
    await client.wishlistItem.deleteMany({ where: { userId: wishlist.userId } });
    if (wishlist.slugs.length) {
      await client.wishlistItem.createMany({
        data: wishlist.slugs.map((slug, position) => ({ userId: wishlist.userId, slug, position, addedAt: addedAt.get(slug) ?? now })),
      });
    }
  }

  async deleteByUser(userId: string, tx: Transaction): Promise<number> {
    return (await db(this.prisma, tx).wishlistItem.deleteMany({ where: { userId } })).count;
  }
}
