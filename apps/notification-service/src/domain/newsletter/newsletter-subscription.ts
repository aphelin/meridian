import { AggregateRoot, DomainError, ensure } from "@meridian/kernel";
import type { EmailAddress } from "../shared/email-address";
import { SecretToken } from "../shared/secret-token";

export type SubscriptionStatus = "pending" | "confirmed" | "unsubscribed";

export interface NewsletterSubscriptionState {
  id: string;
  email: string;
  status: SubscriptionStatus;
  confirmTokenHash: string | null;
  confirmTokenExpiresAt: Date | null;
  unsubscribeTokenHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
}

/** How long a double opt-in link stays valid. */
export const CONFIRM_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export class TokenInvalidError extends DomainError {
  constructor() {
    super("TOKEN_INVALID", "This link is invalid or has already been used.");
    this.name = "TokenInvalidError";
  }
}

export class TokenExpiredError extends DomainError {
  constructor() {
    super("TOKEN_EXPIRED", "This link has expired. Please subscribe again to get a new one.");
    this.name = "TokenExpiredError";
  }
}

/**
 * Double opt-in newsletter subscription for one address.
 * Invariants:
 * - Nobody is confirmed without proving control of the mailbox (the confirm token only travels by email).
 * - A confirm token is single use, expires after 48 hours and is replaced whenever a new confirmation mail is issued.
 * - Only confirmed subscribers hold an unsubscribe token; unsubscribing is idempotent.
 * - Tokens are stored as hashes only.
 */
export class NewsletterSubscription extends AggregateRoot {
  private constructor(private state: NewsletterSubscriptionState) {
    super();
  }

  /** A new pending subscription and the confirm token to mail. */
  static start(id: string, email: EmailAddress, now: Date): { subscription: NewsletterSubscription; confirmToken: SecretToken } {
    const subscription = new NewsletterSubscription({
      id,
      email: email.value,
      status: "unsubscribed",
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      unsubscribeTokenHash: null,
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
      unsubscribedAt: null,
    });
    const confirmToken = subscription.request(now)!;
    return { subscription, confirmToken };
  }

  static restore(state: NewsletterSubscriptionState): NewsletterSubscription {
    return new NewsletterSubscription({ ...state });
  }

  get id() {
    return this.state.id;
  }
  get email() {
    return this.state.email;
  }
  get status() {
    return this.state.status;
  }

  /**
   * Somebody asked to subscribe this address. Returns the confirm token to mail, or null when the address is
   * already confirmed (nothing to send, and the caller must not reveal that).
   */
  request(now: Date): SecretToken | null {
    if (this.state.status === "confirmed") return null;
    const token = SecretToken.generate();
    this.state.status = "pending";
    this.state.confirmTokenHash = token.hash;
    this.state.confirmTokenExpiresAt = new Date(now.getTime() + CONFIRM_TOKEN_TTL_MS);
    this.state.unsubscribeTokenHash = null;
    this.state.unsubscribedAt = null;
    this.state.updatedAt = now;
    return token;
  }

  /** Confirms with the mailed token and returns the unsubscribe token for the welcome mail. */
  confirm(tokenHash: string, now: Date): SecretToken {
    if (this.state.status !== "pending" || !this.state.confirmTokenHash || this.state.confirmTokenHash !== tokenHash) throw new TokenInvalidError();
    if (!this.state.confirmTokenExpiresAt || this.state.confirmTokenExpiresAt.getTime() <= now.getTime()) throw new TokenExpiredError();
    const unsubscribe = SecretToken.generate();
    this.state.status = "confirmed";
    this.state.confirmTokenHash = null;
    this.state.confirmTokenExpiresAt = null;
    this.state.unsubscribeTokenHash = unsubscribe.hash;
    this.state.confirmedAt = now;
    this.state.updatedAt = now;
    return unsubscribe;
  }

  /** Unsubscribes via the mailed link. Idempotent for the same token. */
  unsubscribe(tokenHash: string, now: Date): void {
    ensure(this.state.unsubscribeTokenHash !== null && this.state.unsubscribeTokenHash === tokenHash, "TOKEN_INVALID", "This link is invalid or has already been used.");
    if (this.state.status === "unsubscribed") return;
    this.state.status = "unsubscribed";
    this.state.unsubscribedAt = now;
    this.state.updatedAt = now;
  }

  /** The customer's account was deleted: stop all mail and invalidate every outstanding link. */
  forget(now: Date): void {
    this.state.status = "unsubscribed";
    this.state.confirmTokenHash = null;
    this.state.confirmTokenExpiresAt = null;
    this.state.unsubscribeTokenHash = null;
    this.state.unsubscribedAt = this.state.unsubscribedAt ?? now;
    this.state.updatedAt = now;
  }

  snapshot(): NewsletterSubscriptionState {
    return { ...this.state };
  }
}
