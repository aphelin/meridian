import { DomainError } from "@meridian/kernel";
import { generateSecret, hashSecret } from "../shared/secret";

export type TokenPurpose = "verify-email" | "password-reset";

/** Lifetimes from the contract: verification links 24 hours, password reset links 1 hour. */
export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  "verify-email": 24 * 60 * 60 * 1000,
  "password-reset": 60 * 60 * 1000,
};

export interface OneTimeTokenState {
  id: string;
  userId: string;
  purpose: TokenPurpose;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

const invalid = () => new DomainError("TOKEN_INVALID", "This link is invalid or has already been used.");

/**
 * A single-use secret sent by email. Only the SHA-256 hash is kept; the plain secret exists only in the issued
 * email link. Consuming checks purpose, prior use and expiry, in that order.
 */
export class OneTimeToken {
  private constructor(private state: OneTimeTokenState) {}

  /** Creates a token and returns the plain secret, which must go into the email and nowhere else. */
  static issue(input: { id: string; userId: string; purpose: TokenPurpose; now: Date }): { token: OneTimeToken; secret: string } {
    const secret = generateSecret();
    const token = new OneTimeToken({
      id: input.id,
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: hashSecret(secret),
      createdAt: input.now,
      expiresAt: new Date(input.now.getTime() + TOKEN_TTL_MS[input.purpose]),
      usedAt: null,
    });
    return { token, secret };
  }

  static rehydrate(state: OneTimeTokenState): OneTimeToken {
    return new OneTimeToken({ ...state });
  }

  get id() {
    return this.state.id;
  }
  get userId() {
    return this.state.userId;
  }
  get purpose() {
    return this.state.purpose;
  }
  get tokenHash() {
    return this.state.tokenHash;
  }
  get expiresAt() {
    return this.state.expiresAt;
  }
  get usedAt() {
    return this.state.usedAt;
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.state.expiresAt.getTime();
  }

  /** Validates and marks the token used. Throws TOKEN_INVALID (wrong purpose, already used) or TOKEN_EXPIRED. */
  consume(purpose: TokenPurpose, now: Date): void {
    if (this.state.purpose !== purpose || this.state.usedAt) throw invalid();
    if (this.isExpired(now)) throw new DomainError("TOKEN_EXPIRED", "This link has expired. Please request a new one.");
    this.state.usedAt = now;
  }

  snapshot(): OneTimeTokenState {
    return { ...this.state };
  }
}

export const tokenInvalidError = invalid;
