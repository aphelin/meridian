import { Injectable } from "@nestjs/common";
import { Cart, CartRepository, ConcurrencyConflictError, type TransactionContext } from "../../domain";
import type { Prisma } from "../../generated/prisma";
import { isUniqueViolation } from "./prisma-errors";
import { type Db, PrismaService } from "./prisma.service";
import { dbOf } from "./prisma-unit-of-work";

const include = { lines: { orderBy: { position: "asc" } } } satisfies Prisma.CartInclude;
type CartRow = Prisma.CartGetPayload<{ include: typeof include }>;

@Injectable()
export class PrismaCartRepository extends CartRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TransactionContext): Promise<Cart | null> {
    const row = await dbOf(this.prisma, tx).cart.findUnique({ where: { id }, include });
    return row ? toDomain(row) : null;
  }

  async findByUserId(userId: string, tx?: TransactionContext): Promise<Cart | null> {
    const row = await dbOf(this.prisma, tx).cart.findUnique({ where: { userId }, include });
    return row ? toDomain(row) : null;
  }

  async save(cart: Cart, tx?: TransactionContext): Promise<void> {
    if (tx) return this.persist(dbOf(this.prisma, tx), cart);
    await this.prisma.$transaction((client) => this.persist(client, cart));
  }

  async deleteByUserId(userId: string, tx?: TransactionContext): Promise<number> {
    return (await dbOf(this.prisma, tx).cart.deleteMany({ where: { userId } })).count;
  }

  async purgeGuestCartsIdleSince(before: Date): Promise<number> {
    return (await this.prisma.cart.deleteMany({ where: { userId: null, updatedAt: { lt: before } } })).count;
  }

  private async persist(db: Db, cart: Cart): Promise<void> {
    const lines = cart.lines.map((line, position) => ({ cartId: cart.id, sku: line.sku, variantId: line.variantId, slug: line.slug, qty: line.qty, unitPriceCents: line.unitPriceCents, position }));
    if (cart.isNew) {
      try {
        await db.cart.create({ data: { id: cart.id, userId: cart.userId, version: 1, createdAt: cart.createdAt, updatedAt: cart.updatedAt } });
      } catch (error) {
        // Another request created this user's (or this id's) cart first: reload and retry.
        if (isUniqueViolation(error)) throw new ConcurrencyConflictError("Cart", cart.id);
        throw error;
      }
    } else {
      const updated = await db.cart.updateMany({ where: { id: cart.id, version: cart.version }, data: { version: { increment: 1 }, updatedAt: cart.updatedAt } });
      if (updated.count === 0) throw new ConcurrencyConflictError("Cart", cart.id);
      await db.cartLine.deleteMany({ where: { cartId: cart.id } });
    }
    if (lines.length) await db.cartLine.createMany({ data: lines });
  }
}

function toDomain(row: CartRow): Cart {
  return Cart.restore({
    id: row.id,
    userId: row.userId,
    lines: row.lines.map((line) => ({ sku: line.sku, variantId: line.variantId, slug: line.slug, qty: line.qty, unitPriceCents: line.unitPriceCents })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  });
}
