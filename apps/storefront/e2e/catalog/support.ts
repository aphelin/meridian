import { expect, test as base, type APIRequestContext } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { CAPTCHA_TEST_TOKEN, stackAdmin, uniqueEmail } from "../support";

/** Catalog e2e helpers: tRPC over HTTP for setup (fresh products, stock, orders) and a worker-scoped admin session. */

type TrpcError = { message?: string; data?: { code?: string; correlationId?: string } };

async function decode<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>, label: string): Promise<T> {
  const text = await res.text();
  let body: { result?: { data?: { json?: T } | T }; error?: { json?: TrpcError } & TrpcError } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!res.ok() || !body || body.error) {
    const e = body?.error?.json ?? body?.error;
    throw new Error(`${label} failed (${res.status()}): ${e?.data?.code ?? ""} ${e?.message ?? text.slice(0, 300)} [${e?.data?.correlationId ?? "-"}]`);
  }
  const data = body.result?.data as { json?: T } | T | null | undefined;
  return (data && typeof data === "object" && "json" in data ? data.json : data) as T;
}

export function query<T>(api: APIRequestContext, path: string, input?: unknown): Promise<T> {
  return api.get(`/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input ?? null }))}`).then((r) => decode<T>(r, path));
}

export function mutate<T>(api: APIRequestContext, path: string, input?: unknown): Promise<T> {
  return api.post(`/api/trpc/${path}`, { data: { json: input ?? null }, headers: { "content-type": "application/json" }, timeout: 30_000 }).then((r) => decode<T>(r, path));
}

/** Polls `probe` until it returns a truthy value. */
export async function eventually<T>(probe: () => Promise<T | null | undefined | false>, what: string, timeoutMs = 60_000, everyMs = 750): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`timed out waiting for ${what}${last ? `: ${last instanceof Error ? last.message : String(last)}` : ""}`);
}

const letters = (n: number) =>
  Array.from(randomBytes(n), (b) => String.fromCharCode(97 + (b % 26))).join("");

/** A whole-euro price no seeded piece has (€31,000–€79,999), so a price filter isolates a test's products. */
export function uniquePriceCents(): number {
  return (31_000 + (randomBytes(4).readUInt32BE() % 49_000)) * 100;
}

type ColorFamily = "neutral" | "white" | "black" | "grey" | "brown" | "green" | "blue" | "red" | "orange" | "yellow" | "pink" | "metal";

export interface VariantSpec {
  label: string;
  colorFamily?: ColorFamily;
  material?: string;
  onHand: number;
}

export interface FreshProduct {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  variants: { id: string; sku: string; label: string }[];
}

type Hit = { slug: string; inStock: boolean };

/** Creates, publishes and stocks a product through the BFF admin procedures, then waits for inventory and search. */
export async function createProduct(admin: APIRequestContext, spec: { priceCents?: number; variants: VariantSpec[]; kind?: string; name?: string }): Promise<FreshProduct> {
  const tag = letters(8);
  const slug = `e2e-${tag}`;
  const name = spec.name ?? `Vale ${tag.charAt(0).toUpperCase()}${tag.slice(1)}`;
  const priceCents = spec.priceCents ?? uniquePriceCents();
  const snapshot = await query<{ materials: { id: string; swatchUrl: string }[] }>(admin, "catalog.snapshot");
  const swatch = (material: string) => snapshot.materials.find((m) => m.id === material)?.swatchUrl ?? "/materials/oak.jpg";
  const materials = [...new Set(spec.variants.map((v) => v.material ?? "oak"))];

  const created = await mutate<{ id: string }>(admin, "admin.products.create", {
    slug,
    name,
    kind: spec.kind ?? "Lounge chair",
    story: `A lounge chair made for storefront catalog tests (${tag}).`,
    categoryId: "seating",
    materials,
    priceCents,
    featured: false,
    soldOut: false,
    heroImageUrl: "/products/pil-lounge-hero.jpg",
    detailImageUrl: null,
    details: { widthCm: 70, depthCm: 80, heightCm: 75, weightKg: 12, construction: "Solid oak frame.", care: "Wipe clean." },
  });
  const variants = spec.variants.map((v, i) => ({ id: `v${i + 1}`, sku: `E2E-${tag.toUpperCase()}-${i + 1}`, label: v.label }));
  await mutate(admin, "admin.products.replaceVariants", {
    id: created.id,
    variants: spec.variants.map((v, i) => ({
      id: variants[i].id,
      sku: variants[i].sku,
      label: v.label,
      colorFamily: v.colorFamily ?? "brown",
      material: v.material ?? "oak",
      swatchUrl: swatch(v.material ?? "oak"),
      imageUrl: "/products/pil-lounge-hero.jpg",
    })),
  });
  await mutate(admin, "admin.products.publish", { id: created.id });
  const product = { id: created.id, slug, name, priceCents, variants };

  // inventory-catalog-sync creates the stock rows from ProductPublished; then set the stock each test needs.
  await eventually(
    async () => (await query<{ sku: string }[]>(admin, "catalog.stock", { skus: variants.map((v) => v.sku) })).length === variants.length,
    `stock rows for ${slug}`,
  );
  for (const [i, v] of spec.variants.entries()) {
    await mutate(admin, "admin.stock.adjust", { sku: variants[i].sku, onHand: v.onHand, reason: "storefront catalog e2e setup" });
  }
  const inStock = spec.variants.some((v) => v.onHand > 0);
  await waitForHit(admin, product, (hit) => hit.inStock === inStock, `search to index ${slug} as ${inStock ? "in stock" : "sold out"}`);
  return product;
}

export async function waitForHit(api: APIRequestContext, product: FreshProduct, accept: (hit: Hit) => boolean, what: string) {
  return eventually(async () => {
    const result = await query<{ items: Hit[] }>(api, "search.products", { minPriceCents: product.priceCents, maxPriceCents: product.priceCents, limit: 50 });
    const hit = result.items.find((h) => h.slug === product.slug);
    return hit && accept(hit) ? hit : null;
  }, what);
}

/** Registers and signs in a shopper on `api` (a page's request context shares the page's cookies). */
export async function registerShopper(api: APIRequestContext, tag = "catalog") {
  const email = uniqueEmail(tag);
  const password = "e2e-password-123";
  const user = await mutate<{ id: string; email: string; name: string }>(api, "auth.register", { name: "Robin Test", email, password, captchaToken: CAPTCHA_TEST_TOKEN });
  return { ...user, password };
}

export async function signInApi(api: APIRequestContext, email: string, password: string) {
  return mutate<{ id: string }>(api, "auth.login", { email, password });
}

/** Places and pays an order for one unit as the signed-in shopper, then fulfils, ships and delivers it as admin. */
export async function deliverPurchase(shopper: APIRequestContext, admin: APIRequestContext, user: { email: string; name: string }, product: FreshProduct) {
  const [variant] = product.variants;
  await mutate(shopper, "cart.setLines", { lines: [{ sku: variant.sku, variantId: variant.id, qty: 1 }] });
  const placed = await mutate<{ order: { id: string }; payment: { transactionId: string; clientSecret: string | null } }>(shopper, "checkout.place", {
    request: {
      customer: { email: user.email, name: user.name },
      shippingAddress: { fullName: user.name, line1: "Torstraße 1", line2: null, city: "Berlin", postalCode: "10119", country: "DE", phone: null },
      shippingMethod: "standard",
      couponCode: null,
    },
    idempotencyKey: randomUUID(),
    captchaToken: CAPTCHA_TEST_TOKEN,
  });
  // Local sandbox or Stripe test mode: both hand out the sandbox-completion secret (Stripe confirms with pm_card_visa).
  expect(placed.payment.clientSecret, "sandbox-completion secret").toBeTruthy();
  await mutate(shopper, "checkout.sandboxPay", { transactionId: placed.payment.transactionId, clientSecret: placed.payment.clientSecret });
  const orderId = placed.order.id;
  await eventually(async () => (await query<{ status: string }>(shopper, "orders.byId", { id: orderId })).status === "paid", "order paid", 60_000, 1000);
  await mutate(admin, "admin.orders.transition", { id: orderId, status: "fulfilling" });
  await mutate(admin, "admin.orders.transition", { id: orderId, status: "shipped", carrier: "DHL", trackingNumber: `E2E${letters(6).toUpperCase()}` });
  await mutate(admin, "admin.orders.transition", { id: orderId, status: "delivered" });
  await eventually(async () => (await query<{ eligible: boolean }>(shopper, "reviews.eligibility", { slug: product.slug })).eligible, "review eligibility after delivery", 60_000, 1000);
  return orderId;
}

/** `admin`: one signed-in admin session per worker (the login policy is 10 per minute per email across all leaves). */
export const test = base.extend<{ fresh: typeof createProduct }, { admin: APIRequestContext; warm: void }>({
  /** `next dev` compiles a route on its first request; compile this leaf's routes once so assertions time real behaviour. */
  warm: [
    async ({ playwright }, use, workerInfo) => {
      const api = await playwright.request.newContext({ baseURL: String(workerInfo.project.use.baseURL) });
      for (const path of ["/", "/shop", "/shop/seating", "/search?q=oak", "/product/holt-sofa", "/saved", "/sitemap.xml"]) {
        await api.get(path, { timeout: 180_000 }).catch(() => undefined);
      }
      await api.dispose();
      await use();
    },
    { scope: "worker", auto: true, timeout: 600_000 },
  ],
  admin: [
    async ({ playwright }, use, workerInfo) => {
      const baseURL = String(workerInfo.project.use.baseURL);
      const admin = await playwright.request.newContext({ baseURL });
      const { email, password } = stackAdmin();
      await signInApi(admin, email, password);
      await use(admin);
      await admin.dispose();
    },
    { scope: "worker", timeout: 60_000 },
  ],
  /** Creates a product for this test and archives it afterwards, so the shared shop stays tidy. */
  fresh: async ({ admin }, use) => {
    const created: string[] = [];
    await use(async (api, spec) => {
      const product = await createProduct(api, spec);
      created.push(product.id);
      return product;
    });
    for (const id of created) await mutate(admin, "admin.products.archive", { id }).catch(() => undefined);
  },
});

export { expect };
