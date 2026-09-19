import { randomBytes, randomUUID } from "node:crypto";
import { tokens } from "./auth";
import { CAPTCHA_TOKEN, cfg } from "./env";
import { analytics, catalog, checkout, identity, inventory, newCorrelationId, notification, payment, search, show } from "./http";
import { linkToken, waitForMail } from "./mailhog";
import { waitFor } from "./wait";

export const uid = (bytes = 4) => randomBytes(bytes).toString("hex");
const letters = (n: number) => Array.from(randomBytes(n), (b) => String.fromCharCode(97 + (b % 26))).join("");
/**
 * A unit price (a multiple of 10 cents, so a 10% coupon stays exact) that grows by 10 cents per minute: products of the newest run always out-earn every earlier run's
 * products in analytics top products (ordered by revenue), so "top 50" lookups stay deterministic on a long-lived stack.
 */
export const rankingPriceCents = (offset = 0) => 5_000_000 + 10 * Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 60_000) + 10 * offset;
export const uniqueEmail = (tag: string) => `sys-${tag}-${uid()}@system-tests.meridian.local`;

function ok(r: { status: number; text: string }, expected: number | number[], what: string) {
  const list = Array.isArray(expected) ? expected : [expected];
  if (!list.includes(r.status)) throw new Error(`${what}: expected ${list.join("/")}, got ${show(r as any)}`);
}

export const address = { fullName: "System Tester", line1: "1 Integration Strasse", line2: null, city: "Berlin", postalCode: "10115", country: "DE", phone: "+49 30 1234567" };

// ── catalog + inventory ────────────────────────────────────────────────────────

export interface FreshProduct {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  variants: { variantId: string; sku: string }[];
}

/**
 * Creates and publishes a brand-new product through catalog admin, then waits until inventory-catalog-sync created
 * stock for every variant (and, when `onHand` is given, sets that stock level through inventory admin).
 */
export async function createProduct({ priceCents = 50_000, variants = 1, onHand, correlationId }: { priceCents?: number; variants?: number; onHand?: number; correlationId?: string } = {}): Promise<FreshProduct> {
  const admin = tokens.admin();
  const tag = letters(8);
  const slug = `sys-${tag}`;
  const name = `Sys${tag}`;
  const created = await catalog().post(
    "/admin/products",
    {
      slug, name, kind: "System test stool", story: `A stool made for cross-service system tests (${tag}).`, categoryId: "seating", materials: ["oak"], priceCents,
      featured: false, soldOut: false, heroImageUrl: "/products/pil-lounge-hero.jpg", detailImageUrl: null,
      details: { widthCm: 40, depthCm: 40, heightCm: 45, weightKg: 4, construction: "Solid oak.", care: "Wipe clean." },
    },
    { token: admin, correlationId },
  );
  ok(created, 201, "create product");
  const vs = Array.from({ length: variants }, (_, i) => ({ variantId: `v${i + 1}`, sku: `SYS-${tag.toUpperCase()}-${i + 1}` }));
  const put = await catalog().put(
    `/admin/products/${created.json.id}/variants`,
    vs.map((v, i) => ({ id: v.variantId, sku: v.sku, label: `Oak ${i + 1}`, colorFamily: "brown", material: "oak", swatchUrl: "/materials/oak.jpg", imageUrl: "/products/pil-lounge-hero.jpg" })),
    { token: admin, correlationId },
  );
  ok(put, 200, "put variants");
  const published = await catalog().post(`/admin/products/${created.json.id}/publish`, undefined, { token: admin, correlationId });
  ok(published, [200, 201], "publish product");
  for (const v of vs) {
    await waitFor(async () => (await inventory().get(`/stock/${v.sku}`)).status === 200, `inventory stock row for ${v.sku} (inventory-catalog-sync)`, { timeoutMs: 60_000 });
    if (onHand !== undefined) await setStock(v.sku, onHand);
  }
  return { id: created.json.id, slug, name, priceCents, variants: vs };
}

export interface AdminStock {
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
}

export async function setStock(sku: string, onHand: number, reason = "system test setup"): Promise<AdminStock> {
  const r = await inventory().post("/admin/stock/adjust", { sku, onHand, reason }, { token: tokens.admin() });
  ok(r, [200, 201], `adjust stock ${sku}`);
  return r.json;
}

export async function adminStock(sku: string): Promise<AdminStock> {
  const r = await inventory().get("/admin/stock", { token: tokens.admin() });
  ok(r, 200, "admin stock");
  const row = (r.json as AdminStock[]).find((s) => s.sku === sku);
  if (!row) throw new Error(`no admin stock row for ${sku}`);
  return row;
}

export async function searchHit(name: string, slug: string) {
  const r = await search().get(`/search/products?q=${encodeURIComponent(name)}&limit=20`);
  ok(r, 200, "search");
  return (r.json.items as { slug: string; inStock: boolean; priceCents: number }[]).find((i) => i.slug === slug) ?? null;
}

// ── identity ──────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/** Registers through identity (captcha test token) and verifies the email with the link delivered to Mailhog. */
export async function registerUser(tag: string, { verify = true, correlationId }: { verify?: boolean; correlationId?: string } = {}): Promise<User> {
  const email = uniqueEmail(tag);
  const password = `pw-${uid(8)}`;
  const name = `System ${tag}`;
  const reg = await identity().post("/auth/register", { email, password, name }, { headers: { "x-captcha-token": CAPTCHA_TOKEN }, correlationId });
  ok(reg, 201, "register");
  const user: User = { id: reg.json.user.id, email, name, password, accessToken: reg.json.accessToken, refreshToken: reg.json.refreshToken };
  if (verify) {
    const mail = await waitForMail(email, (m) => /verify-email\?token=/.test(m.body), "verify-email link");
    const verified = await identity().post("/auth/verify-email", { token: linkToken(mail, "/account/verify-email") });
    ok(verified, 200, "verify email");
    if (verified.json.emailVerified !== true) throw new Error(`email not verified: ${verified.text}`);
  }
  return user;
}

export async function adminLogin(): Promise<string> {
  const r = await identity().post("/auth/login", { email: cfg.adminEmail, password: cfg.adminPassword });
  ok(r, [200, 201], "admin login");
  if (r.json.user.role !== "admin") throw new Error(`stack admin is not an admin: ${r.text}`);
  return r.json.accessToken;
}

// ── checkout + payment ───────────────────────────────────────────────────────

export interface Line {
  sku: string;
  variantId: string;
  qty: number;
}

export interface Placed {
  order: any;
  payment: { paymentId: string; transactionId: string; clientSecret: string; provider: string };
  accessToken: string | null;
  correlationId: string;
}

export async function setCart(token: string, lines: Line[]) {
  const r = await checkout().put("/cart/items", { lines }, { token });
  ok(r, 200, "put cart");
  return r.json;
}

/** Places an order for a signed-in shopper from their server cart. */
export async function placeOrder(user: { token: string; email: string; name: string }, lines: Line[], { couponCode = null, shippingMethod = "standard", correlationId = newCorrelationId("order") }: { couponCode?: string | null; shippingMethod?: string; correlationId?: string } = {}): Promise<Placed> {
  await setCart(user.token, lines);
  const r = await checkout().post(
    "/orders",
    { customer: { email: user.email, name: user.name }, shippingAddress: address, shippingMethod, couponCode },
    { token: user.token, headers: { "idempotency-key": randomUUID() }, correlationId },
  );
  ok(r, 201, "place order");
  return { ...r.json, correlationId };
}

/** Completes the local sandbox payment the way the storefront does. */
export async function pay(placed: Placed, correlationId = newCorrelationId("pay")) {
  const r = await payment().post(`/payments/${placed.payment.transactionId}/sandbox-complete`, { clientSecret: placed.payment.clientSecret }, { correlationId });
  ok(r, 202, "sandbox complete");
  return r;
}

export async function orderAsAdmin(orderId: string) {
  const r = await checkout().get(`/admin/orders/${orderId}`, { token: tokens.admin() });
  ok(r, 200, "admin order");
  return r.json;
}

export async function waitForOrderStatus(orderId: string, status: string | ((o: any) => boolean), timeoutMs = 60_000) {
  const matches = typeof status === "string" ? (o: any) => o.status === status : status;
  return waitFor(
    async () => {
      const r = await checkout().get(`/orders/${orderId}`, { token: tokens.admin() });
      return r.status === 200 && matches(r.json) ? r.json : null;
    },
    `order ${orderId} to reach ${typeof status === "string" ? status : "the expected state"}`,
    { timeoutMs, intervalMs: 500 },
  );
}

export async function paidOrder(user: { token: string; email: string; name: string }, lines: Line[], opts: { couponCode?: string | null } = {}) {
  const placed = await placeOrder(user, lines, opts);
  await pay(placed);
  const order = await waitForOrderStatus(placed.order.id, "paid");
  return { placed, order };
}

export async function transition(orderId: string, body: Record<string, unknown>, token = tokens.admin()) {
  const r = await checkout().post(`/admin/orders/${orderId}/transition`, body, { token });
  ok(r, [200, 201], `transition ${orderId} → ${String(body.status)}`);
  return r.json;
}

export async function deliver(orderId: string, token = tokens.admin()) {
  await transition(orderId, { status: "fulfilling" }, token);
  const trackingNumber = `SYS${uid(5).toUpperCase()}`;
  await transition(orderId, { status: "shipped", carrier: "DHL", trackingNumber }, token);
  await transition(orderId, { status: "delivered" }, token);
  return { trackingNumber };
}

export async function paymentSummary(orderId: string) {
  const r = await payment().get(`/payments/by-order/${orderId}`, { token: tokens.admin() });
  ok(r, 200, "payment summary");
  return r.json;
}

// ── notification + analytics ────────────────────────────────────────────────

export interface EmailDelivery {
  id: string;
  template: string;
  to: string;
  subject: string;
  status: string;
  attempts: number;
  lastError: string | null;
  correlationId: string;
  createdAt: string;
  sentAt: string | null;
}

/** Newest-first EmailDelivery rows from notification admin, filtered by recipient (pages until found or exhausted). */
export async function emailDeliveries(to: string, { template, status, maxPages = 10 }: { template?: string; status?: string; maxPages?: number } = {}): Promise<EmailDelivery[]> {
  const found: EmailDelivery[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (template) qs.set("template", template);
    if (status) qs.set("status", status);
    if (cursor) qs.set("cursor", cursor);
    const r = await notification().get(`/admin/emails?${qs}`, { token: tokens.admin() });
    ok(r, 200, "admin emails");
    found.push(...(r.json.items as EmailDelivery[]).filter((d) => d.to.toLowerCase() === to.toLowerCase()));
    cursor = r.json.nextCursor;
    if (!cursor) break;
  }
  return found;
}

export async function waitForDelivery(to: string, template: string, predicate: (d: EmailDelivery) => boolean = (d) => d.status === "sent", timeoutMs = 45_000) {
  return waitFor(async () => (await emailDeliveries(to, { template })).find(predicate), `EmailDelivery ${template} to ${to}`, { timeoutMs, intervalMs: 1000 });
}

export async function analyticsOverview(days = 30) {
  const r = await analytics().get(`/analytics/overview?days=${days}`, { token: tokens.admin() });
  ok(r, 200, "analytics overview");
  return r.json;
}

export async function topProducts(days = 30, limit = 50) {
  const r = await analytics().get(`/analytics/top-products?days=${days}&limit=${limit}`, { token: tokens.admin() });
  ok(r, 200, "top products");
  return r.json as { sku: string; slug: string; productName: string; units: number; revenueCents: number }[];
}

export async function groupStatus(service: "notification" | "search" | "analytics" | "catalog" | "checkout" | "inventory", group: string) {
  const client = { notification, search, analytics, catalog, checkout, inventory }[service]();
  const r = await client.get("/admin/messaging", { token: tokens.admin() });
  ok(r, 200, `${service} messaging status`);
  return (r.json.consumerGroups as { group: string; members: number; lag: number; state: string; dlt: { topic: string; messages: number } }[]).find((g) => g.group.endsWith(`.${group}`) || g.group === group) ?? null;
}
