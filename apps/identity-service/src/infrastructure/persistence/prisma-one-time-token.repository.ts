import type { OneTimeToken as TokenRow } from "../../generated/prisma";
import { OneTimeToken, OneTimeTokenRepository, type TokenPurpose } from "../../domain";
import type { Db } from "./prisma-types";

const PURPOSES: readonly TokenPurpose[] = ["verify-email", "password-reset"];

function toDomain(row: TokenRow): OneTimeToken | null {
  const purpose = PURPOSES.find((p) => p === row.purpose);
  if (!purpose) return null;
  return OneTimeToken.rehydrate({ ...row, purpose });
}

export class PrismaOneTimeTokenRepository extends OneTimeTokenRepository {
  constructor(private readonly db: Db) {
    super();
  }

  async findByHash(tokenHash: string): Promise<OneTimeToken | null> {
    const row = await this.db.oneTimeToken.findUnique({ where: { tokenHash } });
    return row ? toDomain(row) : null;
  }

  async add(token: OneTimeToken): Promise<void> {
    await this.db.oneTimeToken.create({ data: token.snapshot() });
  }

  async markUsed(token: OneTimeToken): Promise<boolean> {
    if (!token.usedAt) throw new Error("markUsed called for a token that was not consumed");
    const { count } = await this.db.oneTimeToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: token.usedAt } });
    return count === 1;
  }

  async invalidateOutstanding(userId: string, purpose: TokenPurpose, now: Date): Promise<number> {
    const { count } = await this.db.oneTimeToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: now } });
    return count;
  }
}
