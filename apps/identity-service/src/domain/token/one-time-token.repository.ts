import type { OneTimeToken, TokenPurpose } from "./one-time-token";

export abstract class OneTimeTokenRepository {
  abstract findByHash(tokenHash: string): Promise<OneTimeToken | null>;
  abstract add(token: OneTimeToken): Promise<void>;
  /** Persists `usedAt` only if the token is still unused; false when another request consumed it first. */
  abstract markUsed(token: OneTimeToken): Promise<boolean>;
  /** Invalidates every unused token of that purpose for the user (a new link supersedes older ones). */
  abstract invalidateOutstanding(userId: string, purpose: TokenPurpose, now: Date): Promise<number>;
}
