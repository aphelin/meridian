import { describe, expect, it } from "vitest";
import { envInt, envList, requireEnv } from "./env";
import { assertSandboxPayments, assertSandboxSmtp, SandboxOnlyError } from "./sandbox";

const expectSandboxError = (fn: () => void) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SandboxOnlyError);
    expect((error as SandboxOnlyError).code).toBe("SANDBOX_ONLY");
    return;
  }
  throw new Error("expected SandboxOnlyError");
};

describe("sandbox payment guard", () => {
  it("sandbox payment guard allows an environment without Paddle configuration", () => {
    expect(() => assertSandboxPayments({})).not.toThrow();
  });

  it("sandbox payment guard accepts sandbox keys and test client tokens", () => {
    expect(() =>
      assertSandboxPayments({ PADDLE_ENV: "sandbox", PADDLE_API_KEY: "pdl_sdbx_apikey_123", PADDLE_CLIENT_TOKEN: "test_abc", NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_abc" }),
    ).not.toThrow();
  });

  it("sandbox payment guard rejects any Paddle variable without PADDLE_ENV=sandbox", () => {
    expectSandboxError(() => assertSandboxPayments({ PADDLE_API_KEY: "pdl_sdbx_apikey_123" }));
    expectSandboxError(() => assertSandboxPayments({ PADDLE_ENV: "production" }));
    expectSandboxError(() => assertSandboxPayments({ PADDLE_ENV: "Sandbox", PADDLE_WEBHOOK_SECRET: "x" }));
  });

  it("sandbox payment guard rejects live API keys and live client tokens", () => {
    expectSandboxError(() => assertSandboxPayments({ PADDLE_ENV: "sandbox", PADDLE_API_KEY: "pdl_live_apikey_123" }));
    expectSandboxError(() => assertSandboxPayments({ PADDLE_ENV: "sandbox", PADDLE_CLIENT_TOKEN: "live_abc" }));
    expectSandboxError(() => assertSandboxPayments({ PADDLE_ENV: "sandbox", NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "live_abc" }));
  });
});

describe("sandbox smtp guard", () => {
  it("sandbox smtp guard accepts local mail catchers", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "[::1]", "mailhog", "MailHog"]) {
      expect(() => assertSandboxSmtp({ SMTP_HOST: host })).not.toThrow();
    }
  });

  it("sandbox smtp guard rejects real relays and a missing host", () => {
    expectSandboxError(() => assertSandboxSmtp({ SMTP_HOST: "smtp.sendgrid.net" }));
    expectSandboxError(() => assertSandboxSmtp({}));
  });

  it("sandbox smtp guard honours SMTP_SANDBOX_HOSTS", () => {
    expect(() => assertSandboxSmtp({ SMTP_HOST: "mailpit", SMTP_SANDBOX_HOSTS: "mailpit, catcher.internal" })).not.toThrow();
    expectSandboxError(() => assertSandboxSmtp({ SMTP_HOST: "smtp.example.com", SMTP_SANDBOX_HOSTS: "mailpit" }));
  });
});

describe("env readers", () => {
  it("envInt parses integers, falls back when unset and rejects malformed or out-of-range values", () => {
    expect(envInt("N", 7, { env: {} })).toBe(7);
    expect(envInt("N", 7, { env: { N: " 42 " } })).toBe(42);
    expect(() => envInt("N", 7, { env: { N: "4.2" } })).toThrow(/integer/);
    expect(() => envInt("N", 7, { env: { N: "abc" } })).toThrow(/integer/);
    expect(() => envInt("N", 7, { env: { N: "0" }, min: 1 })).toThrow(/between/);
  });

  it("envList splits comma lists and drops blanks", () => {
    expect(envList("L", ["a"], {})).toEqual(["a"]);
    expect(envList("L", [], { L: " x, ,y ,," })).toEqual(["x", "y"]);
  });

  it("requireEnv throws for missing or blank values", () => {
    expect(requireEnv("R", { R: "value" })).toBe("value");
    expect(() => requireEnv("R", { R: "  " })).toThrow(/R is required/);
    expect(() => requireEnv("R", {})).toThrow(/R is required/);
  });
});
