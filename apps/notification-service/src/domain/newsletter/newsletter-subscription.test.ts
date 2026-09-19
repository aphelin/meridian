import { describe, expect, it } from "vitest";
import { EmailAddress } from "../shared/email-address";
import { SecretToken } from "../shared/secret-token";
import { CONFIRM_TOKEN_TTL_MS, NewsletterSubscription, TokenExpiredError, TokenInvalidError } from "./newsletter-subscription";

const t0 = new Date("2026-09-17T10:00:00Z");
const start = () => NewsletterSubscription.start("nls_1", EmailAddress.parse("reader@example.com"), t0);

describe("NewsletterSubscription (double opt-in)", () => {
  it("newsletter subscription starts pending and stores only the token hash", () => {
    const { subscription, confirmToken } = start();
    expect(subscription.status).toBe("pending");
    expect(subscription.snapshot().confirmTokenHash).toBe(SecretToken.hashOf(confirmToken.value));
    expect(JSON.stringify(subscription.snapshot())).not.toContain(confirmToken.value);
  });

  it("newsletter confirm is single use and issues an unsubscribe token", () => {
    const { subscription, confirmToken } = start();
    const unsubscribe = subscription.confirm(confirmToken.hash, t0);
    expect(subscription.status).toBe("confirmed");
    expect(subscription.snapshot().unsubscribeTokenHash).toBe(unsubscribe.hash);
    expect(() => subscription.confirm(confirmToken.hash, t0)).toThrow(TokenInvalidError);
  });

  it("newsletter confirm link expires after 48 hours", () => {
    const { subscription, confirmToken } = start();
    expect(() => subscription.confirm(confirmToken.hash, new Date(t0.getTime() + CONFIRM_TOKEN_TTL_MS))).toThrow(TokenExpiredError);
  });

  it("a repeated newsletter request rotates the link, and a confirmed address gets no new mail", () => {
    const { subscription, confirmToken } = start();
    const second = subscription.request(t0)!;
    expect(second.hash).not.toBe(confirmToken.hash);
    expect(() => subscription.confirm(confirmToken.hash, t0)).toThrow(TokenInvalidError);
    subscription.confirm(second.hash, t0);
    expect(subscription.request(t0)).toBeNull();
  });

  it("newsletter unsubscribe is idempotent and requires the right token", () => {
    const { subscription, confirmToken } = start();
    const unsubscribe = subscription.confirm(confirmToken.hash, t0);
    expect(() => subscription.unsubscribe("wrong", t0)).toThrow(/invalid/);
    subscription.unsubscribe(unsubscribe.hash, t0);
    subscription.unsubscribe(unsubscribe.hash, t0);
    expect(subscription.status).toBe("unsubscribed");
  });

  it("forget invalidates every newsletter link", () => {
    const { subscription, confirmToken } = start();
    subscription.forget(t0);
    expect(subscription.status).toBe("unsubscribed");
    expect(() => subscription.confirm(confirmToken.hash, t0)).toThrow(TokenInvalidError);
  });
});
