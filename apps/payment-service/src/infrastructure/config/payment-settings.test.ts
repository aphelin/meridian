import { describe, expect, it } from "vitest";
import { HmacClientSecrets } from "../providers/hmac-client-secrets";
import { loadPaymentConfig, PADDLE_SANDBOX_API } from "./payment-settings";

describe("payment config sandbox guard", () => {
  it("defaults to the local sandbox provider without Paddle variables", () => {
    expect(loadPaymentConfig({ NODE_ENV: "test" }).paddle).toBeNull();
  });

  it("refuses live Paddle environments, keys and client tokens (SANDBOX_ONLY)", () => {
    const base = { PADDLE_ENV: "sandbox", PADDLE_API_KEY: "pdl_sdbx_apikey_x", PADDLE_CLIENT_TOKEN: "test_x" };
    expect(() => loadPaymentConfig({ ...base, PADDLE_ENV: "production" })).toThrow(expect.objectContaining({ code: "SANDBOX_ONLY" }));
    expect(() => loadPaymentConfig({ ...base, PADDLE_API_KEY: "pdl_live_apikey_x" })).toThrow(expect.objectContaining({ code: "SANDBOX_ONLY" }));
    expect(() => loadPaymentConfig({ ...base, PADDLE_CLIENT_TOKEN: "live_x" })).toThrow(expect.objectContaining({ code: "SANDBOX_ONLY" }));
  });

  it("uses the fixed Paddle sandbox API unless NODE_ENV=test overrides it", () => {
    const base = { PADDLE_ENV: "sandbox", PADDLE_API_KEY: "pdl_sdbx_apikey_x", PADDLE_CLIENT_TOKEN: "test_x", PADDLE_API_BASE_URL: "http://127.0.0.1:9/" };
    expect(loadPaymentConfig({ ...base, NODE_ENV: "production" }).paddle?.baseUrl).toBe(PADDLE_SANDBOX_API);
    expect(loadPaymentConfig({ ...base, NODE_ENV: "test" }).paddle?.baseUrl).toBe("http://127.0.0.1:9");
  });
});

describe("stripe test mode guard and provider selection", () => {
  const stripe = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PUBLISHABLE_KEY: "pk_test_x" };

  it("selects Stripe by default when its keys are set, else Paddle, else local; PAYMENT_PROVIDER overrides", () => {
    const paddle = { PADDLE_ENV: "sandbox", PADDLE_API_KEY: "pdl_sdbx_apikey_x", PADDLE_CLIENT_TOKEN: "test_x" };
    expect(loadPaymentConfig({ ...stripe, ...paddle }).provider).toBe("stripe");
    expect(loadPaymentConfig(paddle).provider).toBe("paddle");
    expect(loadPaymentConfig({}).provider).toBe("local");
    expect(loadPaymentConfig({ ...stripe, ...paddle, PAYMENT_PROVIDER: "paddle" }).provider).toBe("paddle");
    const local = loadPaymentConfig({ ...stripe, PAYMENT_PROVIDER: "local" });
    expect(local.provider).toBe("local");
    expect(local.stripe?.publishableKey).toBe("pk_test_x");
    expect(loadPaymentConfig({ STRIPE_SECRET_KEY: "rk_test_x", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_y" }).stripe?.publishableKey).toBe("pk_test_y");
  });

  it("refuses live Stripe keys in any Stripe variable (SANDBOX_ONLY)", () => {
    const sandboxOnly = expect.objectContaining({ code: "SANDBOX_ONLY" });
    expect(() => loadPaymentConfig({ ...stripe, STRIPE_SECRET_KEY: "sk_live_x" })).toThrow(sandboxOnly);
    expect(() => loadPaymentConfig({ ...stripe, STRIPE_SECRET_KEY: "rk_live_x" })).toThrow(sandboxOnly);
    expect(() => loadPaymentConfig({ ...stripe, STRIPE_PUBLISHABLE_KEY: "pk_live_x" })).toThrow(sandboxOnly);
    expect(() => loadPaymentConfig({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_x" })).toThrow(sandboxOnly);
    expect(() => loadPaymentConfig({ ...stripe, STRIPE_SECRET_KEY: "not_a_key" })).toThrow(sandboxOnly);
  });

  it("refuses an explicit provider that is not configured, and unknown providers", () => {
    expect(() => loadPaymentConfig({ PAYMENT_PROVIDER: "stripe" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => loadPaymentConfig({ PAYMENT_PROVIDER: "paddle" })).toThrow(/PADDLE_API_KEY/);
    expect(() => loadPaymentConfig({ PAYMENT_PROVIDER: "braintree" })).toThrow(/PAYMENT_PROVIDER/);
    expect(() => loadPaymentConfig({ STRIPE_SECRET_KEY: "sk_test_x" })).toThrow(/STRIPE_PUBLISHABLE_KEY/);
  });
});

describe("client secrets", () => {
  it("sandbox client secrets are deterministic per payment and verified against the stored hash", () => {
    const secrets = new HmacClientSecrets("unit-key-0123456789-0123456789-0123");
    const secret = secrets.issue("pay_1");
    expect(secrets.issue("pay_1")).toBe(secret);
    expect(secrets.issue("pay_2")).not.toBe(secret);
    const hash = secrets.hash(secret);
    expect(hash).not.toContain(secret);
    expect(secrets.matches(secret, hash)).toBe(true);
    expect(secrets.matches("nope", hash)).toBe(false);
  });
});
