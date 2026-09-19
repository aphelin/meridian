import { hashSecret } from "../shared/secret";
import type { RefreshTokenRepository } from "./refresh-token.repository";

export type RotationOutcome =
  | { kind: "rotated"; userId: string; familyId: string }
  | { kind: "unknown" }
  | { kind: "reused"; familyId: string }
  | { kind: "expired" };

/**
 * Domain service for refresh token rotation with family reuse detection:
 * - the presented token is revoked atomically (compare-and-set), so exactly one caller can rotate it;
 * - a token that was already revoked means replay: the whole family is revoked;
 * - an expired token is consumed but yields no new session.
 * Outcomes are returned rather than thrown so the family revocation commits before the caller answers 401.
 */
export class RefreshTokenRotation {
  constructor(private readonly tokens: RefreshTokenRepository) {}

  async rotate(presentedSecret: string, now: Date): Promise<RotationOutcome> {
    const token = await this.tokens.findByHash(hashSecret(presentedSecret));
    if (!token) return { kind: "unknown" };
    const rotated = await this.tokens.revokeIfActive(token.id, now);
    if (!rotated) {
      await this.tokens.revokeFamily(token.familyId, now);
      return { kind: "reused", familyId: token.familyId };
    }
    if (token.isExpired(now)) return { kind: "expired" };
    return { kind: "rotated", userId: token.userId, familyId: token.familyId };
  }
}
