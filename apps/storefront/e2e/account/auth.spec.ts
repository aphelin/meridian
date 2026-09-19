import { onStore, passTurnstile, register, uniqueEmail } from "../support";
import { accountMenu, createShopper, expect, mailhogLinks, mutate, query, submitSignIn, test } from "./helpers";

const VERIFY_LINK = /\/account\/verify-email\?token=/;

test.describe("account: sign up, verification and sign in", () => {
  test("create account with Turnstile, then verify email through the Mailhog link", async ({ page }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail("account-register");

    await page.goto("/account");
    await page.getByRole("tab", { name: "Create account" }).click();
    // The submit waits for the captcha token.
    await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
    await page.getByLabel("Name").fill("Nora Verify");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
    await passTurnstile(page);
    await page.getByRole("button", { name: "Create account", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Hi, Nora" })).toBeVisible({ timeout: 20_000 });
    await expect(accountMenu(page, "Nora")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Verify your email address" })).toBeVisible();
    await expect(page.getByText("Not verified").first()).toBeVisible();

    // The email points at PUBLIC_SITE_URL; open the same path and token on the storefront under test.
    const [link] = await mailhogLinks(email, VERIFY_LINK);
    await page.goto(onStore(link));
    await expect(page.getByRole("heading", { name: "Your email is verified" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("status").filter({ hasText: email })).toBeVisible();
    // The one-time token is dropped from the address bar once read.
    await expect(page).not.toHaveURL(/token=/);

    await page.getByRole("link", { name: "Go to your account" }).click();
    await expect(page.getByRole("heading", { name: "Hi, Nora" })).toBeVisible();
    await expect(page.getByText("Verified", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Verify your email address" })).toHaveCount(0);
    expect((await query<{ emailVerified: boolean }>(page.request, "auth.me")).emailVerified).toBe(true);
  });

  test("resend verification email from the banner supersedes the old link, and the new link verifies", async ({ page }) => {
    test.setTimeout(150_000);
    const shopper = await register(page, { name: "Otto Resend", email: uniqueEmail("account-resend") });
    const [first] = await mailhogLinks(shopper.email, VERIFY_LINK);

    const banner = page.getByRole("region", { name: "Verify your email address" });
    const resend = banner.getByRole("button", { name: "Resend verification email" });
    await passTurnstile(page, banner);
    await expect(resend).toBeEnabled();
    await resend.click();
    await expect(banner.getByRole("status")).toContainText("We sent a new link");

    const links = await mailhogLinks(shopper.email, VERIFY_LINK, 2);
    const latest = links.find((l) => l !== first);
    expect(latest, "a second, different verification link").toBeTruthy();

    await page.goto(onStore(first));
    await expect(page.getByRole("heading", { name: /This link doesn.t work any more/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("alert").filter({ hasText: "invalid or has already been used" })).toBeVisible();

    await page.goto(onStore(latest!));
    await expect(page.getByRole("heading", { name: "Your email is verified" })).toBeVisible({ timeout: 20_000 });
    expect((await query<{ emailVerified: boolean }>(page.request, "auth.me")).emailVerified).toBe(true);
  });

  test("sign in rejects a wrong password, then signs in and merges the guest cart and saved pieces into the account", async ({ page, playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    const shopper = await createShopper(api, "signin", "Sigrid Merge");
    await api.dispose();

    // As a guest: one piece in the server cart (cart cookie) and one saved on the device.
    const snapshot = await query<{ products: { slug: string; name: string; soldOut: boolean; variants: { id: string; sku: string }[] }[] }>(page.request, "catalog.snapshot");
    const products = snapshot.products.filter((p) => !p.soldOut && p.variants.length);
    expect(products.length).toBeGreaterThan(1);
    const inCart = products[Math.floor(Math.random() * products.length)];
    const saved = products.find((p) => p.slug !== inCart.slug)!;
    await mutate(page.request, "cart.setLines", { lines: [{ sku: inCart.variants[0].sku, variantId: inCart.variants[0].id, qty: 2 }] });
    await page.goto("/account");
    await page.evaluate((slug) => window.localStorage.setItem("meridian.saved.v2", JSON.stringify([slug])), saved.slug);
    await page.reload();
    await expect(page.getByRole("button", { name: "Cart, 2 items" })).toBeVisible();

    await submitSignIn(page, shopper.email, "not-the-password");
    await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();

    await page.getByLabel("Password", { exact: true }).fill(shopper.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hi, Sigrid" })).toBeVisible({ timeout: 20_000 });
    await expect(accountMenu(page, "Sigrid")).toBeVisible();

    // Merged server side: the account cart holds the guest line and the wishlist holds the device's saved piece.
    await expect
      .poll(async () => (await query<{ lines: { sku: string; qty: number }[] }>(page.request, "cart.get")).lines.map((l) => `${l.sku}x${l.qty}`))
      .toContain(`${inCart.variants[0].sku}x2`);
    expect((await query<{ slugs: string[] }>(page.request, "wishlist.get")).slugs).toContain(saved.slug);
    await expect(page.getByRole("button", { name: "Cart, 2 items" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Saved items, 1" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Saved" }).getByRole("link", { name: saved.name })).toBeVisible();
  });

  test("signed-out visitors get the sign in form on account pages and return there after signing in", async ({ page, playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    const shopper = await createShopper(api, "return", "Mika Return");
    await api.dispose();

    await page.goto("/account/addresses");
    await expect(page.getByText("Sign in to manage your saved addresses.")).toBeVisible({ timeout: 20_000 });
    await submitSignIn(page, shopper.email, shopper.password);
    await expect(page.getByRole("heading", { name: "Addresses", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/account\/addresses$/);

    // The account menu signs out and leaves the private page for the sign in form.
    await accountMenu(page, "Mika").click();
    await expect(page.getByRole("menuitem", { name: "Addresses" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Your orders" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/account$/);

    // `?next=` brings the shopper back after signing in; off-site targets are ignored.
    await page.goto("/account?next=/account/profile");
    await submitSignIn(page, shopper.email, shopper.password);
    await expect(page).toHaveURL(/\/account\/profile$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Password", exact: true })).toBeVisible();
  });
});
