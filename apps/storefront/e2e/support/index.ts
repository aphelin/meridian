import { expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";

/** Shared helpers for storefront Playwright specs running against the shared backend stack. */

export const CAPTCHA_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/** Seeded stack admin (stack.mjs); overridable for other environments. */
export function stackAdmin() {
  return {
    email: process.env.STACK_ADMIN_EMAIL ?? "admin@stack.meridian.local",
    password: process.env.STACK_ADMIN_PASSWORD ?? "stack-admin-password-1",
  };
}

/** A fresh address per test run. `.test` is deliverable to Mailhog (reserved `.invalid`/`.example` are suppressed). */
export function uniqueEmail(tag = "e2e") {
  return `${tag}-${Date.now()}-${randomBytes(3).toString("hex")}@e2e.meridian.test`;
}

type MailhogItem = { Content: { Headers: Record<string, string[]>; Body: string }; MIME?: { Parts?: { Headers?: Record<string, string[]>; Body?: string }[] } };

function decodeBody(message: MailhogItem): string {
  const parts = message.MIME?.Parts?.length ? message.MIME.Parts : [{ Headers: message.Content.Headers, Body: message.Content.Body }];
  return parts
    .map((part) => {
      const encoding = (part.Headers?.["Content-Transfer-Encoding"]?.[0] ?? "").toLowerCase();
      const body = part.Body ?? "";
      if (encoding === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
      if (encoding === "quoted-printable") return body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      return body;
    })
    .join("\n");
}

export interface MailhogMessage {
  subject: string;
  body: string;
}

export async function mailhogMessages(email: string): Promise<MailhogMessage[]> {
  const api = process.env.MAILHOG_API_URL ?? "http://localhost:8025";
  const res = await fetch(`${api}/api/v2/search?kind=to&query=${encodeURIComponent(email)}&limit=50`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: MailhogItem[] };
  return (json.items ?? []).map((m) => ({ subject: m.Content.Headers.Subject?.[0] ?? "", body: decodeBody(m) }));
}

/**
 * Waits for an email to `email` containing a link that matches `pattern` (e.g. /reset-password\?token=/) and returns
 * the absolute link with HTML entities decoded.
 */
export async function mailhogLink(email: string, pattern: RegExp, { timeoutMs = 60_000 } = {}): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const message of await mailhogMessages(email).catch(() => [])) {
      for (const [raw] of message.body.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
        const link = raw.replace(/&amp;/g, "&");
        if (pattern.test(link)) return link;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no email to ${email} with a link matching ${pattern}`);
}

/** Rewrites a link from an email (PUBLIC_SITE_URL host) onto the storefront under test, keeping path and query. */
export function onStore(link: string): string {
  const url = new URL(link);
  return `${url.pathname}${url.search}`;
}

/** Waits until the Turnstile widget produced a token (the test site key passes automatically). */
export async function passTurnstile(page: Page, scope: Page | ReturnType<Page["locator"]> = page) {
  await expect(scope.locator('[data-slot="turnstile"] input[name="captchaToken"]').first()).not.toHaveValue("", { timeout: 20_000 });
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/account");
  await page.getByRole("tab", { name: "Sign in" }).click();
  // Scoped to the active auth tab panel so other "Email" fields on the page (e.g. the footer newsletter) never clash.
  const panel = page.getByRole("tabpanel", { name: "Sign in" });
  await panel.getByLabel("Email").fill(email);
  await panel.getByLabel("Password", { exact: true }).fill(password);
  await panel.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeHidden({ timeout: 20_000 });
}

export async function register(page: Page, { name, email, password = "e2e-password-123" }: { name: string; email: string; password?: string }) {
  await page.goto("/account");
  await page.getByRole("tab", { name: "Create account" }).click();
  const panel = page.getByRole("tabpanel", { name: "Create account" });
  await panel.getByLabel("Name").fill(name);
  await panel.getByLabel("Email").fill(email);
  await panel.getByLabel("Password", { exact: true }).fill(password);
  await passTurnstile(page, panel);
  await panel.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("tab", { name: "Create account" })).toBeHidden({ timeout: 20_000 });
  return { name, email, password };
}
