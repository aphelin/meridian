import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ChaosError, clearChaos, setChaosRule } from "../core/chaos";
import { RequestContext } from "../core/context";
import { metricsRegistry } from "../core/metrics";
import { type BlackholeServer, startBlackholeServer } from "../testing/helpers";
import { BreakerRegistry, createBreaker } from "./breaker";
import { UpstreamHttpError, UpstreamUnavailableError } from "./errors";
import { ResilientHttpClient } from "./resilient-http-client";

type Seen = { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string };

let stub: http.Server;
let stubUrl: string;
let hole: BlackholeServer;
const seen: Seen[] = [];
let flaky = 0;

beforeAll(async () => {
  stub = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      if (req.url === "/ok") return json(200, { hello: "world" });
      if (req.url === "/empty") return res.writeHead(204).end();
      if (req.url === "/garbled") return res.writeHead(200, { "content-type": "application/json" }).end("{not json");
      if (req.url === "/coupon") return json(422, { statusCode: 422, code: "COUPON_INVALID", message: "Unknown coupon", correlationId: "x", details: { code: "NOPE" } });
      if (req.url === "/boom") return json(500, { statusCode: 500, code: "INTERNAL", message: "db exploded", correlationId: "x" });
      if (req.url === "/flaky") return ++flaky < 3 ? json(503, { message: "busy" }) : json(200, { attempts: flaky });
      json(404, { message: "no route" });
    });
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  stubUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  hole = await startBlackholeServer();
});

afterAll(async () => {
  await hole.close();
  await new Promise((resolve) => stub.close(resolve));
});

afterEach(async () => {
  BreakerRegistry.reset();
  seen.length = 0;
  vi.unstubAllEnvs();
  await clearChaos();
});

let clientSeq = 0;
const client = (options: Partial<ConstructorParameters<typeof ResilientHttpClient>[0]> = {}) =>
  new ResilientHttpClient({ name: `test-client-${++clientSeq}`, baseUrl: stubUrl, timeoutMs: 300, ...options });

describe("circuit breaker", () => {
  it("breaker opens after the failure rate crosses 50% of at least 5 calls and then fails fast", async () => {
    const action = vi.fn(async () => {
      throw new Error("down");
    });
    const breaker = createBreaker("unit-open", "unit.open", action, { timeoutMs: 1000 });
    for (let i = 0; i < 5; i++) await expect(breaker.fire()).rejects.toThrow("down");
    expect(breaker.state()).toBe("open");
    const started = Date.now();
    await expect(breaker.fire()).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", reason: "breaker-open" });
    expect(Date.now() - started).toBeLessThan(50);
    expect(action).toHaveBeenCalledTimes(5);
    expect(BreakerRegistry.snapshot()).toEqual([expect.objectContaining({ name: "unit-open", target: "unit.open", state: "open", failures: 5 })]);
    expect(await metricsRegistry.metrics()).toMatch(/circuit_breaker_state\{name="unit-open"\} 2/);
  });

  it("breaker ignores neutral errors so they neither open nor dilute the failure rate", async () => {
    let fail = false;
    const breaker = createBreaker(
      "unit-neutral",
      "unit.neutral",
      async () => {
        throw fail ? new Error("down") : new UpstreamHttpError(404, "NOT_FOUND", "missing", null);
      },
      { isNeutral: (e) => e instanceof UpstreamHttpError && e.status < 500 },
    );
    for (let i = 0; i < 10; i++) await expect(breaker.fire()).rejects.toBeInstanceOf(UpstreamHttpError);
    expect(breaker.state()).toBe("closed");
    expect(breaker.status()).toMatchObject({ successes: 0, failures: 0 });
    fail = true;
    for (let i = 0; i < 5; i++) await expect(breaker.fire()).rejects.toThrow("down");
    expect(breaker.state()).toBe("open");
  });

  it("breaker half-opens after the reset timeout and closes on a successful trial", async () => {
    let healthy = false;
    const breaker = createBreaker("unit-reset", "unit.reset", async () => {
      if (!healthy) throw new Error("down");
      return "ok";
    }, { resetTimeoutMs: 100 });
    for (let i = 0; i < 5; i++) await expect(breaker.fire()).rejects.toThrow();
    expect(breaker.state()).toBe("open");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(breaker.state()).toBe("half-open");
    healthy = true;
    await expect(breaker.fire()).resolves.toBe("ok");
    expect(breaker.state()).toBe("closed");
    expect(breaker.status().lastStateChangeAt).not.toBeNull();
  });

  it("breaker timeout rejects slow actions with UpstreamUnavailableError(timeout)", async () => {
    const breaker = createBreaker("unit-timeout", "unit.timeout", () => new Promise((resolve) => setTimeout(resolve, 500)), { timeoutMs: 50 });
    const started = Date.now();
    await expect(breaker.fire()).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(300);
    expect(breaker.status().timeouts).toBe(1);
  });

  it("breaker evaluates chaos rules at its target", async () => {
    vi.stubEnv("CHAOS_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "test");
    const breaker = createBreaker("unit-chaos", "unit.chaos", async () => "real");
    await setChaosRule({ target: "unit.*", fault: "fail", rate: 1, delayMs: 0, ttlSec: 30 });
    await expect(breaker.fire()).rejects.toBeInstanceOf(ChaosError);
    await clearChaos();
    await expect(breaker.fire()).resolves.toBe("real");
  });
});

describe("resilient http client", () => {
  it("parses JSON, handles 204 and forwards correlation, auth and idempotency headers", async () => {
    const c = client({ auth: () => "Bearer svc" });
    const body = await RequestContext.run({ correlationId: "corr-http-1" }, () => c.post("/ok", { a: 1 }, { idempotencyKey: "idem-1", headers: { "x-extra": "1" } }));
    expect(body).toEqual({ hello: "world" });
    expect(seen[0]).toMatchObject({ method: "POST", url: "/ok", body: '{"a":1}' });
    expect(seen[0].headers).toMatchObject({ "x-correlation-id": "corr-http-1", authorization: "Bearer svc", "idempotency-key": "idem-1", "x-extra": "1", "content-type": "application/json" });
    await expect(c.delete("/empty")).resolves.toBeUndefined();
  });

  it("treats a 2xx body that claims JSON but is not as an upstream failure", async () => {
    await expect(client().get("/garbled")).rejects.toMatchObject({ status: 502, code: "INTERNAL" });
  });

  it("accepts absolute URLs when the client has no base URL", async () => {
    const c = client({ baseUrl: "" });
    await expect(c.get(`${stubUrl}/ok`)).resolves.toEqual({ hello: "world" });
    await expect(c.get("/relative")).rejects.toThrow(/no baseUrl/);
  });

  it("surfaces upstream 4xx as UpstreamHttpError with the upstream code without opening the breaker", async () => {
    const c = client();
    for (let i = 0; i < 8; i++) {
      await expect(c.get("/coupon")).rejects.toMatchObject({ status: 422, code: "COUPON_INVALID", message: "Unknown coupon", details: { code: "NOPE" } });
    }
    expect(BreakerRegistry.get(c.name)).toMatchObject({ state: "closed", failures: 0 });
  });

  it("timeout against a blackhole upstream maps to UPSTREAM_UNAVAILABLE and five timeouts open the breaker", async () => {
    const c = client({ baseUrl: hole.url, timeoutMs: 100 });
    for (let i = 0; i < 5; i++) {
      const started = Date.now();
      await expect(c.get("/slow")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", reason: "timeout" });
      expect(Date.now() - started).toBeLessThan(400);
    }
    const started = Date.now();
    await expect(c.get("/slow")).rejects.toMatchObject({ reason: "breaker-open" });
    expect(Date.now() - started).toBeLessThan(50);
  });

  it("maps connection failures to UPSTREAM_UNAVAILABLE(network)", async () => {
    const c = client({ baseUrl: "http://127.0.0.1:1" });
    await expect(c.post("/x", {})).rejects.toSatisfy((e) => e instanceof UpstreamUnavailableError && e.reason === "network");
  });

  it("retries GET on 5xx but never retries other methods", async () => {
    flaky = 0;
    await expect(client({ retries: 2 }).get("/flaky")).resolves.toEqual({ attempts: 3 });
    flaky = 0;
    seen.length = 0;
    await expect(client({ retries: 2 }).post("/flaky", {})).rejects.toMatchObject({ status: 503, code: "UPSTREAM_UNAVAILABLE" });
    expect(seen).toHaveLength(1);
    await expect(client().get("/boom")).rejects.toMatchObject({ status: 500, code: "INTERNAL" });
  });
});
