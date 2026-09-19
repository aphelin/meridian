import type { CouponType } from "@meridian/contracts";
import { ConflictError, DomainError } from "@meridian/kernel";
import { Injectable } from "@nestjs/common";
import { Coupon, type CouponRedemption, CouponRepository, type TransactionContext } from "../../domain";
import type { Coupon as CouponRow } from "../../generated/prisma";
import { isUniqueViolation } from "./prisma-errors";
import { PrismaService } from "./prisma.service";
import { dbOf } from "./prisma-unit-of-work";

@Injectable()
export class PrismaCouponRepository extends CouponRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByCode(code: string, tx?: TransactionContext): Promise<Coupon | null> {
    const row = await dbOf(this.prisma, tx).coupon.findUnique({ where: { code: Coupon.normalizeCode(code) } });
    return row ? toDomain(row) : null;
  }

  async hasRedemption(code: string, customerKey: string, tx?: TransactionContext): Promise<boolean> {
    return (await dbOf(this.prisma, tx).couponRedemption.count({ where: { couponCode: code, customerKey } })) > 0;
  }

  async recordRedemption(coupon: Coupon, redemption: CouponRedemption, tx: TransactionContext): Promise<void> {
    const db = dbOf(this.prisma, tx);
    // Conditional increment: concurrent redemptions serialise on the row and re-check the limit on the latest value.
    const bumped = await db.$executeRaw`
      UPDATE "Coupon" SET "redemptions" = "redemptions" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "code" = ${coupon.code} AND "active" = true AND ("maxRedemptions" IS NULL OR "redemptions" < "maxRedemptions")`;
    if (bumped !== 1) throw new DomainError("COUPON_EXHAUSTED", "This code has been fully redeemed.", { couponCode: coupon.code });
    try {
      await db.couponRedemption.create({
        data: {
          id: redemption.id,
          couponCode: redemption.couponCode,
          orderId: redemption.orderId,
          customerKey: redemption.customerKey,
          onceKey: redemption.onceKey,
          discountCents: redemption.discountCents,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, "onceKey")) throw new DomainError("COUPON_ALREADY_USED", "You have already used this code.", { couponCode: coupon.code });
      throw error;
    }
  }

  async releaseRedemption(orderId: string, tx: TransactionContext): Promise<boolean> {
    const db = dbOf(this.prisma, tx);
    const redemption = await db.couponRedemption.findUnique({ where: { orderId } });
    if (!redemption) return false;
    const deleted = await db.couponRedemption.deleteMany({ where: { orderId } });
    if (deleted.count === 0) return false;
    await db.$executeRaw`UPDATE "Coupon" SET "redemptions" = GREATEST("redemptions" - 1, 0), "updatedAt" = CURRENT_TIMESTAMP WHERE "code" = ${redemption.couponCode}`;
    return true;
  }

  async list(): Promise<Coupon[]> {
    const rows = await this.prisma.coupon.findMany({ orderBy: [{ createdAt: "desc" }, { code: "asc" }], take: 1000 });
    return rows.map(toDomain);
  }

  async create(coupon: Coupon, tx?: TransactionContext): Promise<void> {
    const c = coupon.snapshot();
    try {
      await dbOf(this.prisma, tx).coupon.create({ data: { ...terms(c), code: c.code, redemptions: c.redemptions } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`A coupon with the code ${c.code} already exists.`, { code: c.code });
      throw error;
    }
  }

  async updateTerms(coupon: Coupon, tx?: TransactionContext): Promise<void> {
    const c = coupon.snapshot();
    await dbOf(this.prisma, tx).coupon.update({ where: { code: c.code }, data: terms(c) });
  }

  async createIfMissing(coupon: Coupon, tx?: TransactionContext): Promise<boolean> {
    const c = coupon.snapshot();
    const created = await dbOf(this.prisma, tx).coupon.createMany({
      data: [
        {
          code: c.code,
          type: c.type,
          value: c.value,
          minBasketCents: c.minBasketCents,
          maxRedemptions: c.maxRedemptions,
          redemptions: c.redemptions,
          oncePerCustomer: c.oncePerCustomer,
          active: c.active,
          startsAt: c.startsAt,
          expiresAt: c.expiresAt,
        },
      ],
      skipDuplicates: true,
    });
    return created.count === 1;
  }
}

/** Columns an admin may change; `redemptions` is only ever changed by the atomic redemption statements. */
function terms(c: ReturnType<Coupon["snapshot"]>) {
  return {
    type: c.type,
    value: c.value,
    minBasketCents: c.minBasketCents,
    maxRedemptions: c.maxRedemptions,
    oncePerCustomer: c.oncePerCustomer,
    active: c.active,
    startsAt: c.startsAt,
    expiresAt: c.expiresAt,
  };
}

function toDomain(row: CouponRow): Coupon {
  return Coupon.restore({
    code: row.code,
    type: row.type as CouponType,
    value: row.value,
    minBasketCents: row.minBasketCents,
    maxRedemptions: row.maxRedemptions,
    redemptions: row.redemptions,
    oncePerCustomer: row.oncePerCustomer,
    active: row.active,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
  });
}
