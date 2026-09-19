import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { CAPTCHA_TEST_TOKEN, mailhogMessages, uniqueEmail } from "../support";

/** Account e2e helpers: BFF calls for setup, fresh shoppers and Mailhog link polling. */

export const PASSWORD = "e2e-password-123";

type TrpcError = { message: string; data?: { code?: string; status?: number } };
type Body<T> = { result?: { data?: { json?: T } }; error?: { json?: TrpcError } } | null;

export class TrpcFailure extends Error {
  readonly path: string;
  readonly code: string | undefined;
  constructor(path: string, code: string | undefined, message: string) {
    super(`${path} failed: ${code ?? "?"} ${message}`);
    this.path = path;
    this.code = code;
  }
}

async function decode<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>, path: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as Body<T>;
  if (!res.ok() || body?.error) throw new TrpcFailure(path, body?.error?.json?.data?.code, body?.error?.json?.message ?? `HTTP ${res.status()}`);
  return body?.result?.data?.json as T;
}

export async function query<T>(api: APIRequestContext, path: string, input: unknown = null): Promise<T> {
  const res = await api.get(`/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { timeout: 30_000 });
  return decode<T>(res, path);
}

export async function mutate<T>(api: APIRequestContext, path: string, input: unknown = null): Promise<T> {
  const res = await api.post(`/api/trpc/${path}`, { data: { json: input }, headers: { "content-type": "application/json" }, timeout: 30_000 });
  return decode<T>(res, path);
}

export type Shopper = { id: string; name: string; email: string; password: string };

/**
 * Registers a shopper through the BFF on its own request context, so the browser under test stays signed out.
 * Every call uses a unique email; register is limited per IP only, which loopback traffic skips.
 */
export async function createShopper(api: APIRequestContext, tag: string, name = "Robin Account"): Promise<Shopper> {
  const email = uniqueEmail(`account-${tag}`);
  const user = await mutate<{ id: string }>(api, "auth.register", { name, email, password: PASSWORD, captchaToken: CAPTCHA_TEST_TOKEN });
  return { id: user.id, name, email, password: PASSWORD };
}

/** Every distinct link in emails to `email` matching `pattern`, polled until at least `count` exist. */
export async function mailhogLinks(email: string, pattern: RegExp, count = 1, timeoutMs = 60_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let links: string[] = [];
  while (Date.now() < deadline) {
    const messages = await mailhogMessages(email).catch(() => []);
    links = [...new Set(messages.flatMap((m) => [...m.body.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(([raw]) => raw.replace(/&amp;/g, "&"))).filter((l) => pattern.test(l)))];
    if (links.length >= count) return links;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`expected ${count} email link(s) to ${email} matching ${pattern}, found ${links.length}`);
}

/** Waits for an email to `email` whose subject matches `subject`. */
export async function expectEmail(email: string, subject: RegExp, timeoutMs = 60_000) {
  await expect
    .poll(async () => (await mailhogMessages(email).catch(() => [])).some((m) => subject.test(m.subject)), { timeout: timeoutMs, intervals: [1000] })
    .toBe(true);
}

/** The signed-in account menu trigger in the header. */
export function accountMenu(page: Page, firstName: string) {
  return page.getByRole("button", { name: `Account, signed in as ${firstName}` });
}

/** Fills and submits the sign-in form already on screen (the form also appears inline on protected account pages). */
export async function submitSignIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/**
 * `next dev` compiles each route on first request; compile the account routes once per worker so test timings measure
 * the app, not the compiler.
 */
export const test = base.extend<object, { warm: void }>({
  warm: [
    async ({ playwright }, use, workerInfo) => {
      const api = await playwright.request.newContext({ baseURL: String(workerInfo.project.use.baseURL) });
      for (const path of ["/account", "/account/profile", "/account/addresses", "/account/forgot-password", "/account/reset-password?token=x", "/account/verify-email", "/orders"]) {
        await api.get(path, { timeout: 180_000 }).catch(() => undefined);
      }
      await api.dispose();
      await use();
    },
    { scope: "worker", auto: true, timeout: 600_000 },
  ],
});

export { expect };
