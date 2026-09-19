import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { breakerSnapshot, resetBreakers } from "@/server/breaker";
import { ServiceError } from "@/server/errors";
import { ServiceClient } from "@/server/services";
import { apiError, fakeFetch, inScope, json, never, scope } from "./helpers";

let seq = 0;
const client = (impl: typeof fetch, timeoutMs = 5000) => new ServiceClient({ key: `svc${++seq}`, baseUrl: "http://svc.test/", fetchImpl: impl, timeoutMs });

beforeEach(() => resetBreakers());
afterEach(() => resetBreakers());

describe("service client", () => {
  it("forwards the request correlation id, session, cart, idempotency, captcha and order access headers", async () => {
    const fake = fakeFetch(() => json(200, { ok: true }));
    const c = client(fake.impl);
    await inScope(scope(null, { correlationId: "corr-42", forwardedFor: "203.0.113.5" }), () =>
      c.post("/orders", { body: { a: 1 }, token: "jwt", cartId: "cart-1234", idempotencyKey: "key-1", captchaToken: "cap", orderAccess: "acc" }),
    );
    const h = fake.calls[0].headers;
    expect(fake.calls[0].url.href).toBe("http://svc.test/orders");
    expect(Object.fromEntries(h)).toMatchObject({
      "x-correlation-id": "corr-42",
      authorization: "Bearer jwt",
      "x-cart-id": "cart-1234",
      "idempotency-key": "key-1",
      "x-captcha-token": "cap",
      "x-order-access": "acc",
      "x-forwarded-for": "203.0.113.5",
      "content-type": "application/json",
    });
  });

  it("does not send x-forwarded-for when the browser address was loopback", async () => {
    const fake = fakeFetch(() => json(200, {}));
    await inScope(scope(null, { forwardedFor: undefined }), () => client(fake.impl).get("/x"));
    expect(fake.calls[0].headers.has("x-forwarded-for")).toBe(false);
  });

  it("creates a correlation id per call outside a request scope", async () => {
    const fake = fakeFetch(() => json(200, {}));
    await client(fake.impl).get("/x");
    expect(fake.calls[0].headers.get("x-correlation-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("encodes query parameters with comma lists and skips empty values", async () => {
    const fake = fakeFetch(() => json(200, {}));
    await client(fake.impl).get("/search/products", { query: { q: "oak sofa", materials: ["oak", "wool"], colors: [], inStock: true, cursor: undefined } });
    expect(fake.calls[0].url.search).toBe("?q=oak+sofa&materials=oak%2Cwool&inStock=true");
  });

  it("maps an upstream error response to a ServiceError with the upstream error code", async () => {
    const fake = fakeFetch(() => apiError(403, "CAPTCHA_INVALID", "Security check failed"));
    const err = await client(fake.impl).post("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err).toMatchObject({ status: 403, code: "CAPTCHA_INVALID", message: "Security check failed", correlationId: "upstream-corr" });
  });

  it("turns a timeout into 503 UPSTREAM_UNAVAILABLE after the per-call timeout", async () => {
    const fake = fakeFetch(never);
    const started = Date.now();
    const err = await client(fake.impl).get("/slow", { timeoutMs: 150 }).catch((e: unknown) => e);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(err).toMatchObject({ status: 503, code: "UPSTREAM_UNAVAILABLE", reason: "timeout" });
  });

  it("turns a network failure into 503 UPSTREAM_UNAVAILABLE", async () => {
    const fake = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(client(fake.impl).get("/x")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", reason: "network" });
  });

  it("returns accepted error statuses as values", async () => {
    const fake = fakeFetch(() => json(503, { status: "down" }));
    await expect(client(fake.impl).raw("GET", "/health", { acceptStatuses: [503] })).resolves.toEqual({ status: 503, body: { status: "down" } });
  });
});

describe("circuit breaker", () => {
  it("opens the breaker after repeated timeouts and then fails fast without calling upstream", async () => {
    const fake = fakeFetch(never);
    const c = client(fake.impl);
    for (let i = 0; i < 5; i++) await c.get("/slow", { timeoutMs: 30 }).catch(() => undefined);
    const callsBefore = fake.calls.length;
    const started = Date.now();
    const err = await c.get("/slow", { timeoutMs: 30 }).catch((e: unknown) => e);
    expect(Date.now() - started).toBeLessThan(25);
    expect(err).toMatchObject({ status: 503, code: "UPSTREAM_UNAVAILABLE", reason: "breaker-open" });
    expect(fake.calls.length).toBe(callsBefore);
    const status = breakerSnapshot().find((b) => b.name === c.key);
    expect(status).toMatchObject({ state: "open", target: `http:${c.key}`, timeouts: 5 });
  });

  it("does not count upstream 4xx answers toward the breaker", async () => {
    const fake = fakeFetch(() => apiError(404, "NOT_FOUND", "nope"));
    const c = client(fake.impl);
    for (let i = 0; i < 12; i++) await c.get("/missing").catch(() => undefined);
    const status = breakerSnapshot().find((b) => b.name === c.key);
    expect(status).toMatchObject({ state: "closed", failures: 0 });
    expect(fake.calls.length).toBe(12);
  });

  it("counts upstream 5xx answers as breaker failures", async () => {
    const fake = fakeFetch(() => apiError(500, "INTERNAL", "boom"));
    const c = client(fake.impl);
    for (let i = 0; i < 6; i++) await c.get("/boom").catch(() => undefined);
    expect(breakerSnapshot().find((b) => b.name === c.key)?.state).toBe("open");
  });
});
