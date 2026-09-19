import type { RefreshToken } from "./refresh-token";

export abstract class RefreshTokenRepository {
  abstract findByHash(tokenHash: string): Promise<RefreshToken | null>;
  abstract add(token: RefreshToken): Promise<void>;
  /** Atomically revokes the token when still active. False means it was already revoked (reuse or a concurrent rotation). */
  abstract revokeIfActive(id: string, now: Date): Promise<boolean>;
  abstract revokeFamily(familyId: string, now: Date): Promise<number>;
  /** Revokes every active token of the user, except the family named in `keepFamilyId`. */
  abstract revokeAllForUser(userId: string, now: Date, keepFamilyId?: string | null): Promise<number>;
}
