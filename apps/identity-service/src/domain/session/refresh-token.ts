import { generateSecret, hashSecret } from "../shared/secret";

/** Refresh tokens live 30 days; each use rotates them. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface RefreshTokenState {
  id: string;
  familyId: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * One link in a session's rotation chain. All tokens minted from one login share a `familyId`; a revoked token that
 * is presented again means it was stolen or replayed, so the whole family is revoked.
 */
export class RefreshToken {
  private constructor(private readonly state: RefreshTokenState) {}

  static issue(input: { id: string; familyId: string; userId: string; now: Date; ttlMs?: number }): { token: RefreshToken; secret: string } {
    const secret = generateSecret();
    const token = new RefreshToken({
      id: input.id,
      familyId: input.familyId,
      userId: input.userId,
      tokenHash: hashSecret(secret),
      createdAt: input.now,
      expiresAt: new Date(input.now.getTime() + (input.ttlMs ?? REFRESH_TOKEN_TTL_MS)),
      revokedAt: null,
    });
    return { token, secret };
  }

  static rehydrate(state: RefreshTokenState): RefreshToken {
    return new RefreshToken({ ...state });
  }

  get id() {
    return this.state.id;
  }
  get familyId() {
    return this.state.familyId;
  }
  get userId() {
    return this.state.userId;
  }
  get tokenHash() {
    return this.state.tokenHash;
  }
  get expiresAt() {
    return this.state.expiresAt;
  }
  get revokedAt() {
    return this.state.revokedAt;
  }

  isRevoked(): boolean {
    return this.state.revokedAt !== null;
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.state.expiresAt.getTime();
  }

  /** Usable as the family to keep when the owner changes their password. */
  isActiveFor(userId: string, now: Date): boolean {
    return this.state.userId === userId && !this.isRevoked() && !this.isExpired(now);
  }

  snapshot(): RefreshTokenState {
    return { ...this.state };
  }
}
