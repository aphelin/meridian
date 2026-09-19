import type { IdempotencyClaim, IdempotencyStore } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma";
import { isUniqueViolation } from "./prisma-errors";
import { PrismaService } from "./prisma.service";

/** A claim whose request never completed (crashed process) may be taken over after this long. */
export const IDEMPOTENCY_ABANDONED_AFTER_MS = 2 * 60_000;
export const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60_000;

/** Kit IDEMPOTENCY_STORE in Postgres: the primary key on the scoped key hash arbitrates concurrent first requests. */
@Injectable()
export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}

  async claim(key: string, fingerprint: string): Promise<IdempotencyClaim> {
    try {
      await this.prisma.idempotencyKey.create({ data: { key, fingerprint } });
      return { state: "claimed" };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const row = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    // Released between our insert attempt and this read: let the client retry rather than racing a new claim.
    if (!row) return { state: "in-flight" };
    if (row.completedAt && Date.now() - row.createdAt.getTime() > IDEMPOTENCY_RETENTION_MS) return this.takeOverExpired(key, fingerprint, row.createdAt);
    if (row.fingerprint !== fingerprint) return { state: "mismatch" };
    if (row.completedAt) return { state: "replay", response: row.response };
    const takeover = await this.prisma.idempotencyKey.updateMany({
      where: { key, completedAt: null, createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_ABANDONED_AFTER_MS) } },
      data: { createdAt: new Date() },
    });
    return takeover.count ? { state: "claimed" } : { state: "in-flight" };
  }

  async complete(key: string, response: unknown): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { key },
      data: { response: response === null || response === undefined ? Prisma.JsonNull : (response as Prisma.InputJsonValue), completedAt: new Date() },
    });
  }

  async release(key: string): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({ where: { key, completedAt: null } });
  }

  /** Housekeeping: forget keys past the retention window. */
  async purgeExpired(now = new Date()): Promise<number> {
    return (await this.prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_RETENTION_MS) } } })).count;
  }

  private async takeOverExpired(key: string, fingerprint: string, createdAt: Date): Promise<IdempotencyClaim> {
    const taken = await this.prisma.idempotencyKey.updateMany({
      where: { key, createdAt },
      data: { fingerprint, response: Prisma.JsonNull, completedAt: null, createdAt: new Date() },
    });
    return taken.count ? { state: "claimed" } : { state: "in-flight" };
  }
}
