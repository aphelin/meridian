import { expect, request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { CAPTCHA_TEST_TOKEN, passTurnstile, stackAdmin, uniqueEmail } from "../support";

/** Checkout e2e helpers: BFF calls for test setup (cart seeding, orders, admin transitions) and shared UI steps. */

const baseURL = () => process.env.STORE_URL ?? `http://localhost:${process.env.STORE_PORT ?? 3100}`;

type TrpcError = { message: string; data?: { code?: string; status?: number; correlationId?: string } };

async function decode<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>, path: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as { result?: { data?: { json?: T } }; error?: { json?: TrpcError } } | null;
  if (!res.ok() || body?.error) {
    const e = body?.error?.json;
    throw new Error(`${path} failed (${res.status()}): ${e?.data?.code ?? ""} ${e?.message ?? JSON.stringify(body)}`);
  }
  return body?.result?.data?.json as T;
}

/** Calls a BFF query with the cookies of `api` (a page's `request` shares the browser context's cookie jar). */
export async function trpcQuery<T>(api: APIRequestContext, path: string, input: unknown = null): Promise<T> {
  const res = await api.get(`/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { timeout: 30_000 });
  return decode<T>(res, path);
}

export async function trpcMutate<T>(api: APIRequestContext, path: string, input: unknown = null): Promise<T> {
  const res = await api.post(`/api/trpc/${path}`, { data: { json: input }, headers: { "content-type": "application/json" }, timeout: 30_000 });
  return decode<T>(res, path);
}

export type Variant = { slug: string; name: string; sku: string; variantId: string; variantLabel: string; priceCents: number };

type Snapshot = { products: { slug: string; name: string; priceCents: number; soldOut: boolean; variants: { id: string; sku: string; label: string }[] }[] };

let adminApi: Promise<APIRequestContext> | null = null;

/** One signed-in stack admin API session per worker, for transitions a shopper cannot make (ship, deliver, approve returns). */
export function admin(): Promise<APIRequestContext> {
  adminApi ??= (async () => {
    const api = await playwrightRequest.newContext({ baseURL: baseURL() });
    await trpcMutate(api, "auth.login", stackAdmin());
    return api;
  })();
  return adminApi;
}

/**
 * Picks `count` distinct in-stock variants (different products, cheapest first so baskets stay small). Tops stock up
 * through the admin API when a pick runs low, so repeated runs against the shared stack don't drain it.
 */
export async function pickVariants(api: APIRequestContext, count: number, { maxPriceCents = 60_000, minAvailable = 6 } = {}): Promise<Variant[]> {
  const snapshot = await trpcQuery<Snapshot>(api, "catalog.snapshot");
  const candidates = snapshot.products
    .filter((p) => !p.soldOut && p.priceCents <= maxPriceCents && p.variants.length)
    .sort((a, b) => a.priceCents - b.priceCents)
    .map((p) => ({ product: p, variant: p.variants[Math.floor(Math.random() * p.variants.length)] }));
  expect(candidates.length, "catalog has enough affordable products").toBeGreaterThanOrEqual(count);
  // Spread load across products so parallel leaves and repeated runs don't collide on one SKU.
  const offset = Math.floor(Math.random() * Math.max(1, Math.min(4, candidates.length - count + 1)));
  const chosen = candidates.slice(offset, offset + count);
  const stock = await trpcQuery<{ sku: string; available: number }[]>(api, "catalog.stock", { skus: chosen.map((c) => c.variant.sku) });
  for (const c of chosen) {
    const available = stock.find((s) => s.sku === c.variant.sku)?.available ?? 0;
    if (available < minAvailable) await trpcMutate(await admin(), "admin.stock.adjust", { sku: c.variant.sku, delta: 20 - available, reason: "e2e checkout top-up" });
  }
  return chosen.map(({ product, variant }) => ({ slug: product.slug, name: product.name, sku: variant.sku, variantId: variant.id, variantLabel: variant.label, priceCents: product.priceCents }));
}

/** Puts lines in the server cart for this browser context, then opens the cart page, which adopts the server cart. */
export async function seedCart(page: Page, picks: Variant[], qty = 1) {
  await trpcMutate(page.request, "cart.setLines", { lines: picks.map((p) => ({ sku: p.sku, variantId: p.variantId, qty })) });
  await page.goto("/cart");
  for (const p of picks) await expect(page.getByRole("link", { name: p.name, exact: true }).first()).toBeVisible();
}

export const ADDRESS = { fullName: "Ada Lindqvist", line1: "Torstraße 12", city: "Berlin", postalCode: "10119", country: "DE", line2: null, phone: null };

type PlaceResult = { order: { id: string; number: string; pricing: { totalCents: number } }; payment: { transactionId: string; clientSecret: string | null } };

/** Places an order from the context's server cart through the BFF (guest when no session cookie). */
export async function placeOrderApi(page: Page, picks: Variant[], { email = uniqueEmail("checkout"), name = "Ada Lindqvist", qty = 1, pay = true } = {}) {
  await trpcMutate(page.request, "cart.setLines", { lines: picks.map((p) => ({ sku: p.sku, variantId: p.variantId, qty })) });
  const result = await trpcMutate<PlaceResult>(page.request, "checkout.place", {
    request: { customer: { email, name }, shippingAddress: ADDRESS, shippingMethod: "standard", couponCode: null },
    idempotencyKey: randomUUID(),
    captchaToken: CAPTCHA_TEST_TOKEN,
  });
  if (pay) {
    await trpcMutate(page.request, "checkout.sandboxPay", { transactionId: result.payment.transactionId, clientSecret: result.payment.clientSecret });
    // Local sandbox settles at once; Stripe test mode settles when the signed webhook arrives.
    await expect.poll(async () => (await trpcQuery<{ status: string }>(page.request, "orders.byId", { id: result.order.id })).status, { timeout: 60_000 }).toBe("paid");
  }
  return { id: result.order.id, number: result.order.number, email, totalCents: result.order.pricing.totalCents };
}

export async function adminTransition(orderId: string, ...steps: ("fulfilling" | "shipped" | "delivered")[]) {
  const api = await admin();
  for (const status of steps) {
    await trpcMutate(api, "admin.orders.transition", status === "shipped" ? { id: orderId, status, carrier: "DHL", trackingNumber: `E2E${Date.now()}` } : { id: orderId, status });
  }
}

/** Registers a fresh shopper through the BFF in the page's context (captcha test token), leaving it signed in. */
export async function registerApi(page: Page, tag = "shopper") {
  const account = { name: "Mira Holm", email: uniqueEmail(tag), password: "e2e-password-123" };
  await trpcMutate(page.request, "auth.register", { ...account, captchaToken: CAPTCHA_TEST_TOKEN });
  return account;
}

/** Fills the guest contact and address fields of the checkout form. */
export async function fillGuestDetails(page: Page, email: string) {
  const form = page.getByRole("form", { name: "Checkout" });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Name", { exact: true }).fill("Ada Lindqvist");
  await fillAddress(page);
}

export async function fillAddress(page: Page) {
  const form = page.getByRole("form", { name: "Checkout" });
  await form.getByLabel("Full name").fill(ADDRESS.fullName);
  await form.getByLabel("Address", { exact: true }).fill(ADDRESS.line1);
  await form.getByLabel("Postal code").fill(ADDRESS.postalCode);
  await form.getByLabel("City").fill(ADDRESS.city);
}

export async function waitForQuote(page: Page) {
  await expect(page.getByRole("radio", { name: /^Standard delivery/ })).toBeVisible({ timeout: 20_000 });
}

/** Places the order from the checkout page and lands on the payment step. */
export async function submitCheckout(page: Page, { guest }: { guest: boolean }) {
  if (guest) await passTurnstile(page);
  const place = page.getByRole("button", { name: /^Place order/ });
  await expect(place).toBeEnabled({ timeout: 20_000 });
  await place.click();
  await expect(page.getByRole("heading", { level: 1, name: /^Pay for order M-/ })).toBeVisible({ timeout: 30_000 });
}

/** The Stripe Payment Element's iframe (its card fields live inside it). */
export const paymentElement = (page: Page) => page.frameLocator('iframe[title="Secure payment input frame"]').first();

/**
 * Fills the Stripe Payment Element with a test card (any future expiry, any CVC, a postal code when Stripe asks for one)
 * and presses the pay button. Stripe's own field names (number, expiry, cvc, postalCode) are stable test selectors.
 */
export async function payWithStripeCard(page: Page, card = "4242 4242 4242 4242") {
  const element = paymentElement(page);
  const number = element.locator('input[name="number"]');
  const cardTab = element.locator('button[data-value="card"], [role="tab"][data-value="card"], #card-tab').first();
  await expect(number.or(cardTab).first()).toBeVisible({ timeout: 45_000 });
  if (!(await number.isVisible()) && (await cardTab.isVisible())) await cardTab.click();
  await number.fill(card);
  await element.locator('input[name="expiry"]').fill("12 / 34");
  await element.locator('input[name="cvc"]').fill("123");
  const postal = element.locator('input[name="postalCode"]');
  if (await postal.isVisible()) await postal.fill("10119");
  const pay = page.getByRole("button", { name: /^Pay €[\d,.]+$/ });
  await expect(pay).toBeEnabled({ timeout: 20_000 });
  await pay.click();
}

/**
 * Pays on the payment step with whichever provider is active: the Stripe Payment Element (test card 4242…) when
 * Stripe test mode is configured, otherwise the local sandbox button.
 */
export async function payOnPaymentStep(page: Page) {
  const sandbox = page.getByRole("button", { name: /^Pay €[\d,.]+ in sandbox$/ });
  const stripe = page.locator('iframe[title="Secure payment input frame"]');
  await expect(sandbox.or(stripe).first()).toBeVisible({ timeout: 45_000 });
  if (await sandbox.isVisible()) await sandbox.click();
  else await payWithStripeCard(page);
}

export const idFromUrl = (page: Page) => new URL(page.url()).pathname.split("/").pop()!;
