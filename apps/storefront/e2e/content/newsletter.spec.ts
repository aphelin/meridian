import { expect, test, type Page } from "@playwright/test";
import { mailhogLink, onStore, passTurnstile, uniqueEmail } from "../support";
import { waitForMail } from "./helpers";

const CONFIRM_LINK = /\/newsletter\/confirm\?token=/;
const UNSUBSCRIBE_LINK = /\/newsletter\/unsubscribe\?token=/;

/** Subscribes from the footer of the home page and returns the confirmation link from Mailhog. */
async function subscribeFromFooter(page: Page, email: string) {
  await page.goto("/");
  const form = page.getByRole("contentinfo").getByRole("form", { name: "Newsletter" });
  const field = form.getByRole("textbox", { name: "Your address for the newsletter" });
  // Turnstile only loads once the form is used.
  await expect(form.locator('[data-slot="turnstile"]')).toHaveCount(0);
  await field.fill(email);
  await passTurnstile(page, form);
  await form.getByRole("button", { name: "Sign up" }).click();
  const status = page.getByRole("contentinfo").getByRole("status").filter({ hasText: "Check your inbox" });
  await expect(status).toBeVisible({ timeout: 20_000 });
  await expect(status).toContainText(email);
  return mailhogLink(email, CONFIRM_LINK);
}

async function expectNoindex(page: Page) {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
}

test.describe("newsletter", () => {
  test("newsletter double opt-in: footer subscribe with Turnstile, confirm link from Mailhog, welcome email", async ({ page }) => {
    test.setTimeout(150_000);
    const email = uniqueEmail("newsletter-optin");
    const confirm = await subscribeFromFooter(page, email);

    // Emails point at the stack's site URL; open the same path and token on the storefront under test.
    await page.goto(onStore(confirm));
    await expect(page.getByRole("heading", { level: 1, name: "You’re subscribed" })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveTitle(/Confirm your subscription · Meridian/);
    await expectNoindex(page);
    // The one-time token is dropped from the address bar once read.
    await expect(page).not.toHaveURL(/token=/);

    const welcome = await waitForMail(email, { subject: /Welcome to the Meridian newsletter/ });
    expect(welcome.body).toMatch(UNSUBSCRIBE_LINK);

    // The confirmation link is single use.
    await page.goto(onStore(confirm));
    await expect(page.getByRole("heading", { level: 1, name: "This link doesn’t work any more" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("form", { name: "Newsletter" }).first()).toBeVisible();
  });

  test("unsubscribe from the welcome email link after confirming", async ({ page }) => {
    test.setTimeout(150_000);
    const email = uniqueEmail("newsletter-unsub");
    const confirm = await subscribeFromFooter(page, email);
    await page.goto(onStore(confirm));
    await expect(page.getByRole("heading", { level: 1, name: "You’re subscribed" })).toBeVisible({ timeout: 20_000 });

    const unsubscribe = await mailhogLink(email, UNSUBSCRIBE_LINK);
    await page.goto(onStore(unsubscribe));
    await expect(page.getByRole("heading", { level: 1, name: "Unsubscribe from the newsletter?" })).toBeVisible();
    await expect(page).toHaveTitle(/Unsubscribe · Meridian/);
    await expectNoindex(page);
    await expect(page).not.toHaveURL(/token=/);
    // Nothing happens until the shopper confirms.
    await page.getByRole("main").getByRole("button", { name: "Unsubscribe" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "You’re unsubscribed" })).toBeVisible({ timeout: 20_000 });

    // Subscribing again restarts double opt-in with a new confirmation email.
    await page.goto("/");
    const form = page.getByRole("contentinfo").getByRole("form", { name: "Newsletter" });
    await form.getByRole("textbox", { name: "Your address for the newsletter" }).fill(email);
    await passTurnstile(page, form);
    await form.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("contentinfo").getByRole("status").filter({ hasText: "Check your inbox" })).toBeVisible({ timeout: 20_000 });
  });

  test("newsletter confirm and unsubscribe pages handle missing and invalid tokens without indexing", async ({ page }) => {
    await page.goto("/newsletter/confirm");
    await expect(page.getByRole("heading", { level: 1, name: "This link isn’t complete" })).toBeVisible();
    await expectNoindex(page);

    await page.goto(`/newsletter/confirm?token=${"x".repeat(43)}`);
    await expect(page.getByRole("heading", { level: 1, name: "This link doesn’t work any more" })).toBeVisible({ timeout: 20_000 });

    await page.goto(`/newsletter/unsubscribe?token=${"y".repeat(43)}`);
    await expectNoindex(page);
    await page.getByRole("main").getByRole("button", { name: "Unsubscribe" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "This link doesn’t work any more" })).toBeVisible({ timeout: 20_000 });

    await page.goto("/newsletter/unsubscribe");
    await expect(page.getByRole("heading", { level: 1, name: "This link isn’t complete" })).toBeVisible();
  });
});
