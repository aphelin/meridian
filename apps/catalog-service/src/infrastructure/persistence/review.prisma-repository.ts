import { Injectable } from "@nestjs/common";
import type { PurchaseRecord } from "../../domain/review/purchase-record";
import { Review } from "../../domain/review/review";
import { PurchaseRecordRepository, ReviewRepository } from "../../domain/review/review.repository";
import type { Transaction } from "../../domain/shared/transaction";
import { db } from "./prisma-transaction-runner";
import { PrismaService } from "./prisma.service";

@Injectable()
export class ReviewPrismaRepository extends ReviewRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async existsFor(productId: string, userId: string, tx?: Transaction): Promise<boolean> {
    return (await db(this.prisma, tx).review.count({ where: { productId, userId } })) > 0;
  }

  async findByUser(userId: string, tx: Transaction): Promise<Review[]> {
    const rows = await db(this.prisma, tx).review.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    return rows.map((row) => Review.restore(row));
  }

  async save(review: Review, tx: Transaction): Promise<void> {
    const s = review.toState();
    const { id, ...fields } = s;
    await db(this.prisma, tx).review.upsert({ where: { id }, create: s, update: { userId: fields.userId, authorName: fields.authorName, rating: fields.rating, title: fields.title, body: fields.body } });
  }
}

@Injectable()
export class PurchaseRecordPrismaRepository extends PurchaseRecordRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  find(userId: string, slug: string, tx?: Transaction): Promise<PurchaseRecord | null> {
    return db(this.prisma, tx).purchaseRecord.findUnique({ where: { userId_slug: { userId, slug } } });
  }

  async record(record: PurchaseRecord, tx: Transaction): Promise<void> {
    await db(this.prisma, tx).purchaseRecord.createMany({ data: [record], skipDuplicates: true });
  }

  async deleteByUser(userId: string, tx: Transaction): Promise<number> {
    return (await db(this.prisma, tx).purchaseRecord.deleteMany({ where: { userId } })).count;
  }
}
