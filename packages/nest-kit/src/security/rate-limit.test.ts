import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { ExecutionContext } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { metricsRegistry } from "../core/metrics";
import type { RedisService } from "../runtime/redis.service";
import { clientIp, isLoopbackIp } from "./client-ip";
import { RateLimit, RateLimitedError, RateLimiter, RateLimitGuard, type RateLimitPolicy, rateLimitKeys } from "./rate-limit";

/** In-memory port of the sliding-window Lua script (same return contract), so the TypeScript side is tested without Redis. */
function fakeRedis(options: { ready?: boolean; failWith?: Error } = {}) {
  const sets = new Map<string, number[]>();
  let now = 1_000_000;
  const calls: string[][] = [];
  const client = {
    status: options.ready === false ? "reconnecting" : "ready",
    defineCommand: vi.fn(),
    meridianSlidingWindow: vi.fn(async (numKeys: number, ...args: (string | number)[]) => {
      if (options.failWith) throw options.failWith;
      const keys = args.slice(0, numKeys).map(String);
      const [limit, window] = args.slice(numKeys).map(Number);
      calls.push(keys);
      let retryAfter = 0;
      let blocked = false;
      for (const key of keys) {
        const entries = (sets.get(key) ?? []).filter((t) => t > now - window);
        sets.set(key, entries);
        if (entries.length >= limit) {
          blocked = true;
          retryAfter = Math.max(retryAfter, entries[entries.length - limit] + window - now);
        }
      }
      if (blocked) return [0, 0, retryAfter];
      let remaining = limit;
      let reset = 0;
      for (const key of keys) {
        const entries = sets.get(key)!;
        entries.push(now);
        const left = limit - entries.length;
        const frees = entries[0] + window - now;
        if (left < remaining || (left === remaining && frees > reset)) {
          remaining = left;
          reset = frees;
        }
      }
      return [1, remaining, reset];
    }),
  };
  const redis = { client, isReady: () => client.status === "ready" } as unknown as RedisService;
  return { redis, client, calls, advance: (ms: number) => (now += ms) };
}

const policy: RateLimitPolicy = { name: "login", limit: 3, windowSec: 60, by: ["ip", "body:email"] };

class Routes {
  @RateLimit(policy)
  login() {}

  @RateLimit({ name: "resend", limit: 1, windowSec: 600, by: ["user"], failMode: "closed" })
  resend() {}

  @RateLimit({ name: "local", limit: 1, windowSec: 60, by: ["ip"] })
  ipOnly() {}
}

function context(handler: keyof Routes, req: Record<string, unknown>) {
  const headers = new Map<string, string | number>();
  const ctx = {
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, socket: { remoteAddress: "203.0.113.9" }, ...req }), getResponse: () => ({ setHeader: (k: string, v: string | number) => headers.set(k, v) }) }),
  } as unknown as ExecutionContext;
  return { ctx, headers };
}

afterEach(() => vi.unstubAllEnvs());

describe("rate limit keys", () => {
  it("rate limit counts every dimension under rl:<policy>:<dimension>:<value>", () => {
    expect(rateLimitKeys(policy, { ip: "::ffff:203.0.113.9", "body:email": " Ada@Example.com " })).toEqual([
      "rl:login:ip:203.0.113.9",
      "rl:login:body:email:ada@example.com",
    ]);
    expect(rateLimitKeys(policy, { ip: "203.0.113.9" })).toEqual(["rl:login:ip:203.0.113.9"]);
    expect(rateLimitKeys(policy, { "body:email": "x".repeat(300) })[0]).toMatch(/^rl:login:body:email:sha256:[0-9a-f]{64}$/);
  });

  it("rate limit skips loopback ip dimension unless RATE_LIMIT_LOOPBACK=true", () => {
    for (const ip of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"]) {
      expect(rateLimitKeys(policy, { ip, "body:email": "a@b.co" }, {})).toEqual(["rl:login:body:email:a@b.co"]);
    }
    expect(rateLimitKeys(policy, { ip: "127.0.0.1" }, { RATE_LIMIT_LOOPBACK: "true" })).toEqual(["rl:login:ip:127.0.0.1"]);
  });

  it("client ip is the first x-forwarded-for hop, else the socket address", () => {
    expect(clientIp({ headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" }, socket: { remoteAddress: "127.0.0.1" } })).toBe("198.51.100.7");
    expect(clientIp({ headers: { "x-forwarded-for": "garbage" }, socket: { remoteAddress: "::ffff:10.1.2.3" } })).toBe("10.1.2.3");
    expect(isLoopbackIp("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackIp("128.0.0.1")).toBe(false);
  });

  it("rejects invalid policies at decoration time", () => {
    expect(() => RateLimit({ name: "bad", limit: 0, windowSec: 60, by: ["ip"] })).toThrow(/Invalid rate limit policy/);
    expect(() => RateLimit({ name: "bad", limit: 1, windowSec: 60, by: [] })).toThrow(/Invalid rate limit policy/);
  });
});

describe("rate limit guard", () => {
  it("rate limit guard allows up to the limit then answers 429 RATE_LIMITED with Retry-After and RateLimit headers", async () => {
    const { redis } = fakeRedis();
    const guard = new RateLimitGuard(new Reflector(), new RateLimiter(redis));
    const req = { body: { email: "ada@example.com" } };
    for (let i = 0; i < 3; i++) {
      const { ctx, headers } = context("login", req);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(headers.get("RateLimit-Limit")).toBe(3);
      expect(headers.get("RateLimit-Remaining")).toBe(2 - i);
      expect(headers.get("RateLimit-Reset")).toBe(60);
    }
    const { ctx, headers } = context("login", req);
    const error = await guard.canActivate(ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error).toMatchObject({ code: "RATE_LIMITED", details: { retryAfterSec: 60 } });
    expect(headers.get("Retry-After")).toBe(60);
    expect(headers.get("RateLimit-Remaining")).toBe(0);
    expect(await metricsRegistry.metrics()).toMatch(/rate_limit_rejections_total\{policy="login"\} [1-9]/);
  });

  it("rate limit applies each dimension independently: same email from another ip is still limited", async () => {
    const { redis, advance } = fakeRedis();
    const guard = new RateLimitGuard(new Reflector(), new RateLimiter(redis));
    for (let i = 0; i < 3; i++) await guard.canActivate(context("login", { body: { email: "a@b.co" }, headers: { "x-forwarded-for": `198.51.100.${i}` } }).ctx);
    await expect(guard.canActivate(context("login", { body: { email: "a@b.co" }, headers: { "x-forwarded-for": "198.51.100.99" } }).ctx)).rejects.toBeInstanceOf(RateLimitedError);
    await expect(guard.canActivate(context("login", { body: { email: "other@b.co" }, headers: { "x-forwarded-for": "198.51.100.99" } }).ctx)).resolves.toBe(true);
    advance(60_001);
    await expect(guard.canActivate(context("login", { body: { email: "a@b.co" } }).ctx)).resolves.toBe(true);
  });

  it("rate limit is skipped when a loopback request leaves no countable dimension", async () => {
    const { redis, client } = fakeRedis();
    const guard = new RateLimitGuard(new Reflector(), new RateLimiter(redis));
    for (let i = 0; i < 5; i++) {
      const { ctx, headers } = context("ipOnly", { socket: { remoteAddress: "127.0.0.1" } });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(headers.size).toBe(0);
    }
    expect(client.meridianSlidingWindow).not.toHaveBeenCalled();
  });

  it("rate limit resolves the user dimension from the bearer token when the auth guard has not run yet", async () => {
    const { redis, calls } = fakeRedis();
    const jwt = new JwtService({ secret: "unit-secret-unit-secret-unit-secret!" });
    const guard = new RateLimitGuard(new Reflector(), new RateLimiter(redis), jwt);
    const authorization = `Bearer ${jwt.sign({ sub: "user-42" })}`;
    await guard.canActivate(context("resend", { headers: { authorization } }).ctx);
    expect(calls[0]).toEqual(["rl:resend:user:user-42"]);
    await expect(guard.canActivate(context("resend", { principal: { sub: "user-42" } }).ctx)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("rate limit fails open by default when Redis is unavailable", async () => {
    const { redis, client } = fakeRedis({ ready: false });
    const guard = new RateLimitGuard(new Reflector(), new RateLimiter(redis));
    await expect(guard.canActivate(context("login", { body: { email: "a@b.co" } }).ctx)).resolves.toBe(true);
    expect(client.meridianSlidingWindow).not.toHaveBeenCalled();
    expect(await metricsRegistry.metrics()).toMatch(/rate_limit_store_errors_total\{policy="login",fail_mode="open"\} 1/);
  });

  it("rate limit fails closed with 503 when the policy says so and the Redis command times out", async () => {
    const { redis } = fakeRedis({ failWith: new Error("Command timed out") });
    const guard = new RateLimitGuard(new Reflector(), new RateLimiter(redis));
    await expect(guard.canActivate(context("resend", { principal: { sub: "u1" } }).ctx)).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it("programmatic RateLimiter.consume returns decisions without throwing", async () => {
    const { redis } = fakeRedis();
    const limiter = new RateLimiter(redis);
    const p: RateLimitPolicy = { name: "token", limit: 2, windowSec: 10, by: ["header:x-cart-id"] };
    expect(await limiter.consume(p, { "header:x-cart-id": "cart-1" })).toMatchObject({ allowed: true, remaining: 1, keys: ["rl:token:header:x-cart-id:cart-1"] });
    expect(await limiter.consume(p, { "header:x-cart-id": "cart-1" })).toMatchObject({ allowed: true, remaining: 0 });
    expect(await limiter.consume(p, { "header:x-cart-id": "cart-1" })).toMatchObject({ allowed: false, retryAfterSec: 10 });
  });
});
