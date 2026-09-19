import { Body, Controller, Get, HttpCode, type INestApplication, Module, Post, Query } from "@nestjs/common";
import { DomainError } from "@meridian/kernel";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { RequestContext } from "../core/context";
import { readiness, registerHealthCheck, unregisterHealthCheck } from "../core/health";
import { resetLifecycleForTests, shutdown } from "../core/lifecycle";
import { createLogger } from "../core/logger";
import { parseWith, ZodBody } from "../validation";
import { bootstrapService } from "./bootstrap";
import { closeHttpServer } from "./http-shutdown";
import { correlationIdFrom } from "./request-context";

const log = createLogger("RuntimeTest");

@Controller("t")
class TestController {
  @Get("context")
  async context() {
    await new Promise((resolve) => setTimeout(resolve, 5));
    log.debug("inside request");
    return { correlationId: RequestContext.correlationId() };
  }

  @Post("echo")
  @HttpCode(200)
  echo(@Body() body: unknown) {
    return { correlationId: RequestContext.correlationId(), body: parseWith(z.object({ n: z.int() }), body) };
  }

  @Post("zod-body")
  @HttpCode(200)
  zodBody(@ZodBody(z.object({ email: z.email() })) body: { email: string }) {
    return body;
  }

  @Get("fail")
  fail(@Query("code") code: string) {
    if (code === "crash") throw new Error("secret internals");
    throw new DomainError("OUT_OF_STOCK", "Sold out", { sku: "A" });
  }

  @Get("slow")
  async slow() {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { done: true };
  }
}

@Module({ controllers: [TestController] })
class TestModule {}

let app: INestApplication;
let base: string;

beforeAll(async () => {
  resetLifecycleForTests();
  process.env.PORT = "0";
  app = await bootstrapService({ name: "runtime-unit", module: TestModule, defaultPort: 0 });
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  delete process.env.PORT;
  await app?.close();
  resetLifecycleForTests();
});

describe("correlation id", () => {
  it("correlation id from the request header is reused, echoed and visible in RequestContext across async handlers", async () => {
    const res = await fetch(`${base}/t/context`, { headers: { "x-correlation-id": "corr-unit-1" } });
    expect(res.headers.get("x-correlation-id")).toBe("corr-unit-1");
    expect(await res.json()).toEqual({ correlationId: "corr-unit-1" });
  });

  it("correlation id survives JSON body parsing", async () => {
    const res = await fetch(`${base}/t/echo`, { method: "POST", headers: { "content-type": "application/json", "x-correlation-id": "corr-body" }, body: JSON.stringify({ n: 1 }) });
    expect(await res.json()).toEqual({ correlationId: "corr-body", body: { n: 1 } });
  });

  it("correlation id is generated when missing or malformed", async () => {
    const res = await fetch(`${base}/t/context`, { headers: { "x-correlation-id": "bad value\twith junk" } });
    const body = (await res.json()) as { correlationId: string };
    expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-correlation-id")).toBe(body.correlationId);
    expect(correlationIdFrom(["a-1", "b-2"])).toBe("a-1");
  });
});

describe("bootstrap runtime", () => {
  it("error mapping through the exception filter returns ApiError with correlation id", async () => {
    const res = await fetch(`${base}/t/fail`, { headers: { "x-correlation-id": "corr-err" } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ statusCode: 409, code: "OUT_OF_STOCK", message: "Sold out", correlationId: "corr-err", details: { sku: "A" } });
    const crash = await fetch(`${base}/t/fail?code=crash`);
    const body = await crash.text();
    expect(crash.status).toBe(500);
    expect(body).not.toContain("secret internals");
    const missing = await fetch(`${base}/nope`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("zod validation failures answer 400 VALIDATION_FAILED and malformed JSON is a 400, not a 500", async () => {
    const invalid = await fetch(`${base}/t/echo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: "x" }) });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "VALIDATION_FAILED", details: { issues: [{ path: "n" }] } });
    const malformed = await fetch(`${base}/t/echo`, { method: "POST", headers: { "content-type": "application/json", "x-correlation-id": "corr-json" }, body: "{nope" });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ code: "VALIDATION_FAILED", correlationId: "corr-json" });
  });

  it("ZodBody validation decorator parses the body or answers 400 VALIDATION_FAILED", async () => {
    const post = (body: unknown) => fetch(`${base}/t/zod-body`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const ok = await post({ email: "a@b.co", extra: 1 });
    expect(await ok.json()).toEqual({ email: "a@b.co" });
    const bad = await post({ email: "nope" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "VALIDATION_FAILED", details: { issues: [{ path: "email" }] } });
  });

  it("bodies over 1 MB are rejected with 413 ApiError and helmet headers are set", async () => {
    const res = await fetch(`${base}/t/echo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: 1, pad: "x".repeat(1_100_000) }) });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ statusCode: 413, code: "VALIDATION_FAILED" });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("serves health probes and metrics with the http duration histogram by route template", async () => {
    const live = await fetch(`${base}/health/live`);
    expect(await live.json()).toMatchObject({ status: "ok", service: "runtime-unit" });
    registerHealthCheck("unit-dep", async () => {
      throw new Error("dependency down");
    });
    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(503);
    expect(await ready.json()).toMatchObject({ status: "down", checks: { "unit-dep": { status: "down", error: "dependency down" } } });
    unregisterHealthCheck("unit-dep");
    expect((await fetch(`${base}/health`)).status).toBe(200);
    const metrics = await (await fetch(`${base}/metrics`)).text();
    expect(metrics).toMatch(/http_request_duration_seconds_count\{method="GET",route="\/t\/context",status="200"\} \d+/);
    expect(metrics).toMatch(/process_cpu/);
  });
});

describe("graceful shutdown", () => {
  it("graceful shutdown waits for in-flight requests while refusing new connections", async () => {
    const server = (await import("node:http")).createServer((_req, res) => setTimeout(() => res.end("done"), 300));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const inflight = fetch(url).then((r) => r.text());
    await new Promise((resolve) => setTimeout(resolve, 50));
    const started = Date.now();
    await closeHttpServer(server, 5000);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    expect(await inflight).toBe("done");
    await expect(fetch(url)).rejects.toThrow();
  });

  it("graceful shutdown destroys connections that outlive the grace period", async () => {
    const server = (await import("node:http")).createServer(() => undefined);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const hanging = fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}`).catch((e: unknown) => e);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const started = Date.now();
    await closeHttpServer(server, 100);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(await hanging).toBeInstanceOf(Error);
  });

  it("shutdown flips readiness to 503 and lets the in-flight request of the service finish", async () => {
    const inflight = fetch(`${base}/t/slow`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const done = shutdown("SIGTERM");
    expect((await readiness()).status).toBe("shutting-down");
    const res = await inflight;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ done: true });
    await done;
    expect((app.getHttpServer() as Server).listening).toBe(false);
  });
});
