import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { clearChaos, setChaosRule } from "../core/chaos";
import { metricsRegistry } from "../core/metrics";
import { BreakerRegistry } from "../http/breaker";
import { type BlackholeServer, startBlackholeServer } from "../testing/helpers";
import { CaptchaGuard, RequireCaptcha, TURNSTILE_DEFAULT_VERIFY_URL, TURNSTILE_TEST_SECRET, TurnstileVerifier, turnstileOptionsFromEnv } from "./captcha";

let verifyUrl: string;
let server: http.Server;
let hole: BlackholeServer;
const forms: URLSearchParams[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: { success: true, "error-codes": [] } };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      forms.push(new URLSearchParams(raw));
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  verifyUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/siteverify`;
  hole = await startBlackholeServer();
});

afterAll(async () => {
  await hole.close();
  await new Promise((resolve) => server.close(resolve));
});

afterEach(async () => {
  forms.length = 0;
  reply = { status: 200, body: { success: true, "error-codes": [] } };
  BreakerRegistry.reset();
  vi.unstubAllEnvs();
  await clearChaos();
});

class Routes {
  @RequireCaptcha("register")
  register() {}

  @RequireCaptcha("place-order", { skipWhen: (req) => Boolean(req.principal) })
  placeOrder() {}
}

function context(handler: keyof Routes, req: Record<string, unknown>) {
  return {
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, socket: { remoteAddress: "127.0.0.1" }, ...req }) }),
  } as unknown as ExecutionContext;
}

const guardFor = (options: Partial<ConstructorParameters<typeof TurnstileVerifier>[0]> = {}, jwt?: JwtService) =>
  new CaptchaGuard(new Reflector(), new TurnstileVerifier({ secretKey: "secret-under-test", verifyUrl, timeoutMs: 300, ...options }), jwt);

describe("captcha", () => {
  it("captcha defaults to Cloudflare's always-pass test secret and official siteverify URL", () => {
    expect(turnstileOptionsFromEnv({})).toEqual({ secretKey: TURNSTILE_TEST_SECRET, verifyUrl: TURNSTILE_DEFAULT_VERIFY_URL, timeoutMs: 3000 });
    expect(turnstileOptionsFromEnv({ CAPTCHA_TIMEOUT_MS: "1500", TURNSTILE_SECRET_KEY: "s" })).toMatchObject({ secretKey: "s", timeoutMs: 1500 });
  });

  it("captcha missing token is 400 CAPTCHA_REQUIRED without calling Turnstile", async () => {
    await expect(guardFor().canActivate(context("register", { body: {} }))).rejects.toMatchObject({ code: "CAPTCHA_REQUIRED" });
    expect(forms).toHaveLength(0);
  });

  it("captcha posts secret, response, remoteip and idempotency_key as form data and accepts success", async () => {
    const guard = guardFor();
    await expect(guard.canActivate(context("register", { headers: { "x-captcha-token": "tok-1", "x-forwarded-for": "198.51.100.4" } }))).resolves.toBe(true);
    expect(forms[0].get("secret")).toBe("secret-under-test");
    expect(forms[0].get("response")).toBe("tok-1");
    expect(forms[0].get("remoteip")).toBe("198.51.100.4");
    expect(forms[0].get("idempotency_key")).toMatch(/^[0-9a-f-]{36}$/);
    await expect(guard.canActivate(context("register", { body: { captchaToken: "tok-2" } }))).resolves.toBe(true);
    expect(forms[1].get("response")).toBe("tok-2");
    expect(forms[1].has("remoteip")).toBe(false);
  });

  it("captcha success:false is 403 CAPTCHA_INVALID and so is a token minted for another action", async () => {
    reply = { status: 200, body: { success: false, "error-codes": ["invalid-input-response"] } };
    await expect(guardFor().canActivate(context("register", { body: { captchaToken: "bad" } }))).rejects.toMatchObject({ code: "CAPTCHA_INVALID" });
    reply = { status: 200, body: { success: true, "error-codes": [], action: "contact" } };
    await expect(guardFor().canActivate(context("register", { body: { captchaToken: "other-form" } }))).rejects.toMatchObject({ code: "CAPTCHA_INVALID" });
    expect(await metricsRegistry.metrics()).toMatch(/captcha_verifications_total\{result="invalid"\} 2/);
  });

  it("captcha fails closed with 503 CAPTCHA_UNAVAILABLE on verifier timeout", async () => {
    const guard = guardFor({ verifyUrl: `${hole.url}/siteverify`, timeoutMs: 150 });
    const started = Date.now();
    await expect(guard.canActivate(context("register", { body: { captchaToken: "tok" } }))).rejects.toMatchObject({ code: "CAPTCHA_UNAVAILABLE" });
    expect(Date.now() - started).toBeLessThan(600);
    expect(BreakerRegistry.get("captcha")).toMatchObject({ timeouts: 1 });
  });

  it("captcha fails closed on Turnstile 5xx, secret misconfiguration and chaos at captcha.verify", async () => {
    reply = { status: 502, body: {} };
    await expect(guardFor().canActivate(context("register", { body: { captchaToken: "t" } }))).rejects.toMatchObject({ code: "CAPTCHA_UNAVAILABLE" });
    reply = { status: 200, body: { success: false, "error-codes": ["invalid-input-secret"] } };
    await expect(guardFor().canActivate(context("register", { body: { captchaToken: "t" } }))).rejects.toMatchObject({ code: "CAPTCHA_UNAVAILABLE" });
    reply = { status: 200, body: { success: true } };
    vi.stubEnv("CHAOS_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "test");
    await setChaosRule({ target: "captcha.verify", fault: "fail", rate: 1, delayMs: 0, ttlSec: 30 });
    await expect(guardFor().canActivate(context("register", { body: { captchaToken: "t" } }))).rejects.toMatchObject({ code: "CAPTCHA_UNAVAILABLE" });
  });

  it("captcha breaker opens after repeated failures and then fails fast", async () => {
    reply = { status: 500, body: {} };
    const guard = guardFor();
    for (let i = 0; i < 5; i++) await expect(guard.canActivate(context("register", { body: { captchaToken: "t" } }))).rejects.toMatchObject({ code: "CAPTCHA_UNAVAILABLE" });
    expect(BreakerRegistry.get("captcha")?.state).toBe("open");
    await expect(guard.canActivate(context("register", { body: { captchaToken: "t" } }))).rejects.toMatchObject({ code: "CAPTCHA_UNAVAILABLE" });
    expect(forms).toHaveLength(5);
  });

  it("captcha skipWhen exempts signed-in callers even before the auth guard ran", async () => {
    const jwt = new JwtService({ secret: "unit-secret-unit-secret-unit-secret!" });
    const guard = guardFor({}, jwt);
    await expect(guard.canActivate(context("placeOrder", { headers: { authorization: `Bearer ${jwt.sign({ sub: "u1" })}` } }))).resolves.toBe(true);
    await expect(guard.canActivate(context("placeOrder", { headers: { authorization: "Bearer forged" } }))).rejects.toMatchObject({ code: "CAPTCHA_REQUIRED" });
    expect(forms).toHaveLength(0);
  });
});
