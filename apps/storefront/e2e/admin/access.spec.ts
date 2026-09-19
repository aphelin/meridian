import { expect, test } from "@playwright/test";
import { uniqueEmail } from "../support";
import { withCaptcha } from "./fixtures";

// Fresh browser state: no admin session here.
test.use({ storageState: { cookies: [], origins: [] } });

test("non-admin visitors get a sign-in prompt, customers get admins only (403), and neither sees data", async ({ page }) => {
  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to use the admin console" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Orders" })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const anonymous = await page.request.get(`/api/trpc/admin.orders.list?input=${encodeURIComponent(JSON.stringify({ json: null }))}`);
  expect(anonymous.status()).toBe(401);

  const email = uniqueEmail("admin-customer");
  await withCaptcha(page.request, "auth.register", { name: "Tove Lind", email, password: "e2e-password-123" });

  for (const path of ["/admin/orders", "/admin/system"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "Admins only" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("403 · Forbidden")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
  }
  const forbidden = await page.request.get(`/api/trpc/admin.system.overview?input=${encodeURIComponent(JSON.stringify({ json: null }))}`);
  expect(forbidden.status()).toBe(403);
});
