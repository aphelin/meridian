import { RefreshToken, RefreshTokenRepository } from "../../domain";
import type { Db } from "./prisma-types";

export class PrismaRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.db.refreshToken.findUnique({ where: { tokenHash } });
    return row ? RefreshToken.rehydrate(row) : null;
  }

  async add(token: RefreshToken): Promise<void> {
    await this.db.refreshToken.create({ data: token.snapshot() });
  }

  async revokeIfActive(id: string, now: Date): Promise<boolean> {
    const { count } = await this.db.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } });
    return count === 1;
  }

  async revokeFamily(familyId: string, now: Date): Promise<number> {
    const { count } = await this.db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } });
    return count;
  }

  async revokeAllForUser(userId: string, now: Date, keepFamilyId?: string | null): Promise<number> {
    const { count } = await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null, ...(keepFamilyId ? { familyId: { not: keepFamilyId } } : {}) },
      data: { revokedAt: now },
    });
    return count;
  }
}
