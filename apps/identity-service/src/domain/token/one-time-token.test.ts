import { describe, expect, it } from "vitest";
import { hashSecret } from "../shared/secret";
import { OneTimeToken, TOKEN_TTL_MS } from "./one-time-token";

const now = new Date("2026-09-17T10:00:00.000Z");

describe("OneTimeToken", () => {
  it("stores only the SHA-256 hash of the email verification secret, valid for 24 hours", () => {
    const { token, secret } = OneTimeToken.issue({ id: "t1", userId: "u1", purpose: "verify-email", now });
    expect(secret.length).toBeGreaterThanOrEqual(43);
    expect(token.tokenHash).toBe(hashSecret(secret));
    expect(JSON.stringify(token.snapshot())).not.toContain(secret);
    expect(token.expiresAt.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("gives password reset tokens a 1 hour lifetime", () => {
    const { token } = OneTimeToken.issue({ id: "t1", userId: "u1", purpose: "password-reset", now });
    expect(token.expiresAt.getTime() - now.getTime()).toBe(TOKEN_TTL_MS["password-reset"]);
    expect(TOKEN_TTL_MS["password-reset"]).toBe(60 * 60 * 1000);
  });

  it("is single use: a consumed token is TOKEN_INVALID", () => {
    const { token } = OneTimeToken.issue({ id: "t1", userId: "u1", purpose: "verify-email", now });
    token.consume("verify-email", now);
    expect(token.usedAt).toEqual(now);
    expect(() => token.consume("verify-email", now)).toThrow(expect.objectContaining({ code: "TOKEN_INVALID" }));
  });

  it("reports TOKEN_EXPIRED after its lifetime and TOKEN_INVALID for the wrong purpose", () => {
    const { token } = OneTimeToken.issue({ id: "t1", userId: "u1", purpose: "password-reset", now });
    expect(() => token.consume("verify-email", now)).toThrow(expect.objectContaining({ code: "TOKEN_INVALID" }));
    expect(() => token.consume("password-reset", new Date(now.getTime() + TOKEN_TTL_MS["password-reset"]))).toThrow(expect.objectContaining({ code: "TOKEN_EXPIRED" }));
    expect(token.usedAt).toBeNull();
  });

  it("generates distinct secrets", () => {
    const secrets = new Set(Array.from({ length: 50 }, (_, i) => OneTimeToken.issue({ id: `t${i}`, userId: "u", purpose: "verify-email", now }).secret));
    expect(secrets.size).toBe(50);
  });
});
