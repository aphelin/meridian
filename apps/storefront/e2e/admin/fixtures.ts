import { expect, request as playwrightRequest, test as base, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { CAPTCHA_TEST_TOKEN, stackAdmin, uniqueEmail } from "../support";

/**
 * Admin e2e fixtures. The stack admin signs in once per worker (login is rate limited to 10 per 60 s per email) and the
 * session lives in one storage-state file: each test's browser context starts from it and writes it back when the test
 * ends, so a refresh-token rotation in one test is carried to the next instead of tripping reuse detection.
 */

export const baseURL = () => process.env.STORE_URL ?? `http://localhost:${process.env.STORE_PORT ?? 3100}`;

type TrpcError = { message?: string; data?: { code?: string; correlationId?: string } };

async function decode<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>, label: string): Promise<T> {
  const text = await res.text();
  let body: { result?: { data?: { json?: T } }; error?: { json?: TrpcError } } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!res.ok() || !body || body.error) {
    const e = body?.error?.json;
    throw new Error(`${label} failed (${res.status()}): ${e?.data?.code ?? ""} ${e?.message ?? text.slice(0, 300)} [${e?.data?.correlationId ?? "-"}]`);
  }
  return body.result?.data?.json as T;
}

export function query<T>(api: APIRequestContext, path: string, input?: unknown): Promise<T> {
  return api.get(`/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}`, { timeout: 30_000 }).then((r) => decode<T>(r, path));
}

export function mutate<T>(api: APIRequestContext, path: string, input?: unknown): Promise<T> {
  return api.post(`/api/trpc/${path}`, { data: { json: input ?? null }, headers: { "content-type": "application/json" }, timeout: 30_000 }).then((r) => decode<T>(r, path));
}

/**
 * Explicitly empty state: inside a test, `request.newContext()` would otherwise inherit the admin storage state this
 * file installs, turning "guests" into the admin (and sharing its refresh token).
 */
const NO_SESSION = { cookies: [], origins: [] };

/** A cookie-less BFF client (a guest shopper), disposed by the caller. */
export function guestApi(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: baseURL(), storageState: NO_SESSION });
}

type Fixtures = { admin: APIRequestContext };
type WorkerFixtures = { adminStatePath: string };

export const test = base.extend<Fixtures, WorkerFixtures>({
  adminStatePath: [
    async ({}, provide, workerInfo) => {
      const dir = join(workerInfo.project.outputDir, ".auth");
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `admin-${workerInfo.workerIndex}.json`);
      const api = await playwrightRequest.newContext({ baseURL: baseURL(), storageState: NO_SESSION });
      const user = await mutate<{ role: string }>(api, "auth.login", stackAdmin());
      expect(user.role, "stack admin account has the admin role").toBe("admin");
      await api.storageState({ path });
      await api.dispose();
      await provide(path);
    },
    { scope: "worker" },
  ],
  storageState: async ({ adminStatePath }, provide) => provide(adminStatePath),
  context: async ({ context, adminStatePath }, provide) => {
    await provide(context);
    // Carry any rotated session cookies to the next test of this worker.
    await context.storageState({ path: adminStatePath }).catch(() => undefined);
  },
  /** BFF calls as the signed-in admin, sharing the browser context's cookie jar. */
  admin: async ({ page }, provide) => provide(page.request),
});

export { expect };

// ── test data ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Pick = { slug: string; name: string; sku: string; variantId: string; priceCents: number };

type Snapshot = { products: { slug: string; name: string; priceCents: number; soldOut: boolean; variants: { id: string; sku: string }[] }[] };

/** An affordable in-stock variant, topped up through the admin API so repeated runs never drain the shared stack. */
export async function pickVariant(admin: APIRequestContext): Promise<Pick> {
  const snapshot = await query<Snapshot>(admin, "catalog.snapshot");
  const candidates = snapshot.products.filter((p) => !p.soldOut && p.variants.length && p.priceCents <= 80_000 && !p.slug.startsWith("e2e-")).sort((a, b) => a.priceCents - b.priceCents);
  expect(candidates.length, "catalog has affordable products").toBeGreaterThan(2);
  const product = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
  const variant = product.variants[0];
  const [stock] = await query<{ sku: string; available: number }[]>(admin, "catalog.stock", { skus: [variant.sku] });
  if ((stock?.available ?? 0) < 6) await mutate(admin, "admin.stock.adjust", { sku: variant.sku, delta: 20 - (stock?.available ?? 0), reason: "e2e admin top-up" });
  return { slug: product.slug, name: product.name, sku: variant.sku, variantId: variant.id, priceCents: product.priceCents };
}

export const ADDRESS = { fullName: "Ines Varga", line1: "Keizersgracht 88", line2: null, city: "Amsterdam", postalCode: "1015 CS", country: "NL", phone: null };

type PlaceResult = { order: { id: string; number: string; pricing: { totalCents: number } }; payment: { transactionId: string; clientSecret: string | null } };

/** Places and pays a guest order through the BFF; the returned context holds the guest's order access cookie. */
export async function paidGuestOrder(admin: APIRequestContext, { qty = 1 } = {}) {
  const pick = await pickVariant(admin);
  const guest = await guestApi();
  const email = uniqueEmail("admin-order");
  await mutate(guest, "cart.setLines", { lines: [{ sku: pick.sku, variantId: pick.variantId, qty }] });
  const placed = await withCaptcha<PlaceResult>(guest, "checkout.place", {
    request: { customer: { email, name: "Ines Varga" }, shippingAddress: ADDRESS, shippingMethod: "standard", couponCode: null },
    idempotencyKey: randomUUID(),
  });
  await mutate(guest, "checkout.sandboxPay", { transactionId: placed.payment.transactionId, clientSecret: placed.payment.clientSecret });
  await expect.poll(async () => (await query<{ status: string }>(admin, "admin.orders.byId", { id: placed.order.id })).status, { timeout: 45_000, intervals: [500, 1000] }).toBe("paid");
  return { id: placed.order.id, number: placed.order.number, email, totalCents: placed.order.pricing.totalCents, pick, guest };
}

export async function clearChaos(admin: APIRequestContext, service: string, target: string) {
  await mutate(admin, "admin.system.chaos.clear", { service, target }).catch(async () => {
    // A rotated session in the page context can race the teardown; fall back to a fresh admin login.
    const api = await playwrightRequest.newContext({ baseURL: baseURL(), storageState: NO_SESSION });
    try {
      await mutate(api, "auth.login", stackAdmin());
      await mutate(api, "admin.system.chaos.clear", { service, target });
    } finally {
      await api.dispose();
    }
  });
}

/** A small real PNG (solid colour, 24×24) generated in memory for upload tests. */
export function generatedPng(size = 24, rgb: [number, number, number] = [196, 170, 132]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: size }, () => Buffer.from(rgb)))]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Setup call that goes through Cloudflare's real siteverify endpoint (test keys). Services fail closed with
 * CAPTCHA_UNAVAILABLE when that external call times out, so setup retries (only that code, up to 3 attempts with
 * backoff) instead of failing an admin assertion on a network blip.
 */
export async function withCaptcha<T>(api: APIRequestContext, path: string, input: Record<string, unknown>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await mutate<T>(api, path, { ...input, captchaToken: CAPTCHA_TEST_TOKEN });
    } catch (error) {
      if (attempt >= 3 || !String(error).includes("CAPTCHA_UNAVAILABLE")) throw error;
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }
}
