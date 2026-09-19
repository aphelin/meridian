import { describe, expect, it } from "vitest";
import { EnvIdentitySettings, resolveSiteUrl } from "./env-identity-settings";

describe("identity settings from the environment", () => {
  it("builds email links from PUBLIC_SITE_URL without a trailing slash", () => {
    expect(resolveSiteUrl({ PUBLIC_SITE_URL: "https://shop.example/", NODE_ENV: "production" })).toBe("https://shop.example");
    expect(resolveSiteUrl({ PUBLIC_SITE_URL: "https://example.com/store//" })).toBe("https://example.com/store");
  });

  it("falls back to the local storefront only in development and fails fast otherwise", () => {
    expect(resolveSiteUrl({ NODE_ENV: "development" })).toBe("http://localhost:3100");
    expect(() => resolveSiteUrl({ NODE_ENV: "production" })).toThrow(/PUBLIC_SITE_URL/);
    expect(() => resolveSiteUrl({ PUBLIC_SITE_URL: "javascript:alert(1)" })).toThrow(/http/);
    expect(() => resolveSiteUrl({ PUBLIC_SITE_URL: "https://shop.example/?x=1" })).toThrow(/query/);
  });

  it("reads the seed admin only when both ADMIN_EMAIL and ADMIN_PASSWORD are set", () => {
    expect(new EnvIdentitySettings({ ADMIN_EMAIL: "a@b.co", ADMIN_PASSWORD: "secret-pass" }).admin).toEqual({ email: "a@b.co", password: "secret-pass" });
    expect(new EnvIdentitySettings({ ADMIN_EMAIL: "a@b.co" }).admin).toBeNull();
  });
});
