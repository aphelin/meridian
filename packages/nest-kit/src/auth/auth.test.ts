import { createHmac } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import { verifyBearer } from "./index";
import { orderAccessToken, orderLinkSecret, verifyOrderAccessToken } from "./order-access";
import { jwtSecret } from "./secrets";

const LONG_SECRET = "0123456789abcdef0123456789abcdef-long";

describe("jwt secret policy", () => {
  it("jwt secret is required outside development and test", () => {
    expect(() => jwtSecret({ NODE_ENV: "production" })).toThrow(/JWT_SECRET must be set/);
    expect(() => jwtSecret({ NODE_ENV: "staging", JWT_SECRET: " " })).toThrow(/JWT_SECRET must be set/);
  });

  it("jwt secret shorter than 32 characters is rejected in production", () => {
    expect(() => jwtSecret({ NODE_ENV: "production", JWT_SECRET: "short-secret" })).toThrow(/at least 32/);
    expect(jwtSecret({ NODE_ENV: "production", JWT_SECRET: LONG_SECRET })).toBe(LONG_SECRET);
  });

  it("jwt secret falls back to the dev-only secret in development, test or unset NODE_ENV", () => {
    expect(jwtSecret({})).toBe("dev-only");
    expect(jwtSecret({ NODE_ENV: "development" })).toBe("dev-only");
    expect(jwtSecret({ NODE_ENV: "test", JWT_SECRET: "short" })).toBe("short");
  });
});

describe("order access token", () => {
  const env = { NODE_ENV: "production", ORDER_LINK_SECRET: "order-link-secret-for-tests-0123456789", JWT_SECRET: LONG_SECRET };

  it("order access token is the first 32 base64url chars of HMAC-SHA256(ORDER_LINK_SECRET, orderId)", () => {
    const expected = createHmac("sha256", env.ORDER_LINK_SECRET).update("order_1").digest("base64url").slice(0, 32);
    expect(orderAccessToken("order_1", env)).toBe(expected);
    expect(expected).toHaveLength(32);
  });

  it("order access token verification accepts the right token and rejects tampered or foreign ones", () => {
    const token = orderAccessToken("order_1", env);
    expect(verifyOrderAccessToken("order_1", token, env)).toBe(true);
    expect(verifyOrderAccessToken("order_2", token, env)).toBe(false);
    expect(verifyOrderAccessToken("order_1", `${token.slice(0, -1)}${token.endsWith("x") ? "y" : "x"}`, env)).toBe(false);
    expect(verifyOrderAccessToken("order_1", token.slice(0, 31), env)).toBe(false);
    expect(verifyOrderAccessToken("order_1", undefined, env)).toBe(false);
    expect(verifyOrderAccessToken("", token, env)).toBe(false);
  });

  it("order access token secret is required in production", () => {
    expect(() => orderLinkSecret({ NODE_ENV: "production", JWT_SECRET: LONG_SECRET })).toThrow(/ORDER_LINK_SECRET/);
  });

  it("order access token dev fallback is derived from, not equal to, the jwt secret", () => {
    const devEnv = { NODE_ENV: "development", JWT_SECRET: LONG_SECRET };
    const secret = orderLinkSecret(devEnv);
    expect(secret).not.toBe(LONG_SECRET);
    expect(orderLinkSecret(devEnv)).toBe(secret);
    expect(verifyOrderAccessToken("order_9", orderAccessToken("order_9", devEnv), devEnv)).toBe(true);
  });
});

describe("bearer verification", () => {
  const jwt = new JwtService({ secret: LONG_SECRET, signOptions: { algorithm: "HS256" }, verifyOptions: { algorithms: ["HS256"] } });

  it("returns the principal for a valid token and null without a header", async () => {
    const token = jwt.sign({ sub: "user-1", role: "admin" });
    await expect(verifyBearer(jwt, `Bearer ${token}`)).resolves.toMatchObject({ sub: "user-1", role: "admin" });
    await expect(verifyBearer(jwt, undefined)).resolves.toBeNull();
  });

  it("maps malformed or forged tokens to UNAUTHORIZED", async () => {
    await expect(verifyBearer(jwt, "Basic abc")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const forged = new JwtService({ secret: "another-secret-another-secret-12345" }).sign({ sub: "user-1" });
    await expect(verifyBearer(jwt, `Bearer ${forged}`)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
