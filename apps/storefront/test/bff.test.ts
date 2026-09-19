import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBreakers } from "@/server/breaker";
import { invalidateCatalog } from "@/server/catalog";
import { resetServiceClients } from "@/server/services";
import { resetRotations } from "@/server/session";
import { handleTrpcRequest } from "@/server/trpc/handler";
import { apiError, fakeFetch, json, type Handler } from "./helpers";

const BASE = "http://store.test/api/trpc";
const ORDER_ID = "0b8f7a2e-1111-4a6b-9c1d-2e3f4a5b6c7d";
const ACCESS = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

function install(handler: Handler) {
  const fake = fakeFetch(handler);
  vi.stubGlobal("fetch", fake.impl);
  return fake;
}

const query = (path: string, input: unknown, headers: Record<string, string> = {}) =>
  handleTrpcRequest(new Request(`${BASE}/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { headers }));
const mutate = (path: string, input: unknown, headers: Record<string, string> = {}) =>
  handleTrpcRequest(new Request(`${BASE}/${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ json: input }) }));

async function body(res: Response) {
  const parsed = (await res.json()) as { result?: { data: { json: unknown } }; error?: { json: { message: string; data: Record<string, unknown> } } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response shapes vary per procedure under test
  return { data: parsed.result?.data.json as any, error: parsed.error?.json };
}

beforeEach(() => {
  process.env.CATALOG_URL = "http://catalog.test";
  process.env.CHECKOUT_URL = "http://checkout.test";
  process.env.IDENTITY_URL = "http://identity.test";
  process.env.ANALYTICS_URL = "http://analytics.test";
  resetServiceClients();
  resetBreakers();
  resetRotations();
  invalidateCatalog();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BFF over tRPC", () => {
  it("creates a correlation id, echoes it in x-correlation-id and forwards it upstream", async () => {
    const fake = install(() => apiError(404, "NOT_FOUND", "No such product"));
    const res = await query("catalog.product", { slug: "nope" });
    const id = res.headers.get("x-correlation-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(fake.calls.every((c) => c.headers.get("x-correlation-id") === id)).toBe(true);
  });

  it("keeps the incoming correlation id and puts code, status and correlationId in the error data (error mapping)", async () => {
    install((req) => (req.url.pathname === "/catalog/snapshot" ? json(200, { categories: [], materials: [], products: [] }) : apiError(404, "NOT_FOUND", "No such product", { correlationId: "corr-in" })));
    const res = await query("catalog.product", { slug: "nope" }, { "x-correlation-id": "corr-in" });
    const { error } = await body(res);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-correlation-id")).toBe("corr-in");
    expect(error?.data).toMatchObject({ code: "NOT_FOUND", status: 404, correlationId: "corr-in" });
    expect(error?.data).not.toHaveProperty("stack");
  });

  it("maps invalid input to VALIDATION_FAILED", async () => {
    install(() => json(200, {}));
    const res = await query("catalog.bySlugs", { slugs: Array.from({ length: 51 }, (_, i) => `s${i}`) });
    const { error } = await body(res);
    expect(res.status).toBe(400);
    expect(error?.data.code).toBe("VALIDATION_FAILED");
  });

  it("requires a captcha token before calling identity for register", async () => {
    const fake = install(() => json(201, {}));
    const { error } = await body(await mutate("auth.register", { name: "A", email: "a@b.test", password: "long-enough-1" }));
    expect(error?.data.code).toBe("CAPTCHA_REQUIRED");
    expect(fake.calls).toHaveLength(0);
  });

  it("sets httpOnly session cookies on login and never returns tokens", async () => {
    install(() => json(200, { accessToken: "acc.tok.en", refreshToken: "refresh-token-1", user: { id: "u1", email: "a@b.test", role: "customer" } }));
    const res = await mutate("auth.login", { email: "a@b.test", password: "pw" });
    const { data } = await body(res);
    expect(data).toEqual({ id: "u1", email: "a@b.test", role: "customer" });
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => /^access=acc\.tok\.en;.*HttpOnly/.test(c))).toBe(true);
    expect(cookies.some((c) => /^refresh=refresh-token-1;.*HttpOnly/.test(c))).toBe(true);
  });

  it("guest checkout stores the order access token in the oa_ cookie and strips it from the response", async () => {
    const fake = install(() =>
      json(201, { order: { id: ORDER_ID, status: "placed" }, payment: { transactionId: "t1", clientSecret: "cs" }, accessToken: ACCESS }),
    );
    const request = {
      customer: { email: "g@b.test", name: "Guest" },
      shippingAddress: { fullName: "G", line1: "1 Road", line2: null, city: "Berlin", postalCode: "10115", country: "DE", phone: null },
      shippingMethod: "standard",
      couponCode: null,
    };
    const res = await mutate("checkout.place", { request, idempotencyKey: "4d3b6a3c-5b0e-4f7e-8a51-8c1f2e3d4a5b", captchaToken: "cap" }, { cookie: "cart=cart-12345678" });
    const { data } = await body(res);
    expect(data.accessToken).toBeNull();
    expect(res.headers.getSetCookie()).toContain(`oa_${ORDER_ID}=${ACCESS}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`);
    expect(Object.fromEntries(fake.calls[0].headers)).toMatchObject({ "x-cart-id": "cart-12345678", "idempotency-key": "4d3b6a3c-5b0e-4f7e-8a51-8c1f2e3d4a5b", "x-captcha-token": "cap" });
  });

  it("order access: the oa_ cookie is sent as x-order-access, and an explicit access link is remembered", async () => {
    const fake = install((req) => (req.headers.get("x-order-access") === ACCESS ? json(200, { id: ORDER_ID }) : apiError(403, "FORBIDDEN", "No access")));
    const withCookie = await query("orders.byId", { id: ORDER_ID }, { cookie: `oa_${ORDER_ID}=${ACCESS}` });
    expect((await body(withCookie)).data).toEqual({ id: ORDER_ID });

    const denied = await query("orders.byId", { id: ORDER_ID });
    expect((await body(denied)).error?.data.code).toBe("FORBIDDEN");
    expect(denied.headers.getSetCookie()).toEqual([]);

    const viaLink = await query("orders.byId", { id: ORDER_ID, access: ACCESS });
    expect((await body(viaLink)).data).toEqual({ id: ORDER_ID });
    expect(viaLink.headers.getSetCookie()[0]).toMatch(new RegExp(`^oa_${ORDER_ID}=${ACCESS};.*HttpOnly`));
    expect(fake.calls.at(-1)?.url.pathname).toBe(`/orders/${ORDER_ID}`);
  });

  it("concurrent refresh: parallel requests with only a refresh cookie rotate once", async () => {
    let refreshes = 0;
    install(async (req) => {
      if (req.url.pathname === "/auth/refresh") {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 30));
        return json(200, { accessToken: "new-access", refreshToken: "new-refresh", user: {} });
      }
      if (req.url.pathname === "/me") return req.headers.get("authorization") === "Bearer new-access" ? json(200, { id: "u1", role: "customer" }) : apiError(401, "UNAUTHORIZED", "no");
      return json(404, {});
    });
    const responses = await Promise.all([0, 1, 2].map(() => query("auth.me", null, { cookie: "refresh=old-refresh" })));
    expect(refreshes).toBe(1);
    for (const res of responses) {
      expect((await body(res)).data).toEqual({ id: "u1", role: "customer" });
      expect(res.headers.getSetCookie().some((c) => c.startsWith("access=new-access;"))).toBe(true);
    }
  });

  it("logout revokes the refresh token, clears the session cookies, and auth.me answers a plain null", async () => {
    const fake = install(() => json(204, undefined));
    const res = await mutate("auth.logout", null, { cookie: "access=acc; refresh=ref-1" });
    expect(res.status).toBe(200);
    expect(fake.calls[0].body).toEqual({ refreshToken: "ref-1" });
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => /^access=; Path=\/; Max-Age=0;/.test(c))).toBe(true);
    expect(cookies.some((c) => /^refresh=; Path=\/; Max-Age=0;/.test(c))).toBe(true);
    const me = await query("auth.me", null);
    expect(await me.json()).toEqual({ result: { data: null } });
  });

  it("refuses admin procedures to customers with FORBIDDEN", async () => {
    const fake = install((req) => (req.url.pathname === "/me" ? json(200, { id: "u1", role: "customer" }) : json(200, {})));
    const { error } = await body(await query("admin.analytics.overview", { days: 30 }, { cookie: "access=tok" }));
    expect(error?.data.code).toBe("FORBIDDEN");
    expect(fake.calls.map((c) => c.url.host)).toEqual(["identity.test"]);
  });

  it("rejects cross-site and non-JSON mutations", async () => {
    install(() => json(200, {}));
    const cross = await mutate("auth.logout", null, { "sec-fetch-site": "cross-site" });
    expect(cross.status).toBe(403);
    const form = await handleTrpcRequest(new Request(`${BASE}/auth.logout`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }));
    expect(form.status).toBe(415);
    const huge = await handleTrpcRequest(new Request(`${BASE}/auth.logout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: "x".repeat(1024 * 1024 + 10) }) }));
    expect(huge.status).toBe(413);
    expect(form.headers.get("x-correlation-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("redacts dead-letter payloads returned to admins", async () => {
    install((req) => {
      if (req.url.pathname === "/me") return json(200, { id: "a1", role: "admin" });
      return json(200, [{ id: "d1", source: "rabbit", payload: { template: "password-reset", data: { resetUrl: "http://s/reset?token=secret" } } }]);
    });
    process.env.NOTIFICATION_URL = "http://notification.test";
    resetServiceClients();
    const { data } = await body(await query("admin.system.deadLetters", { service: "notification-service", source: "rabbit", queueOrTopic: "q.dlq" }, { cookie: "access=tok" }));
    expect(data[0].payload).toEqual({ template: "password-reset", data: { resetUrl: "[redacted]" } });
  });
});
