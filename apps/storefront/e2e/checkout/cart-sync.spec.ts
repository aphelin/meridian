import { expect, test } from "@playwright/test";
import { ADDRESS, pickVariants, registerApi, seedCart, trpcMutate, trpcQuery, waitForQuote } from "./helpers";

type Cart = { lines: { sku: string; qty: number }[] };

const serverQty = async (api: import("@playwright/test").APIRequestContext, sku: string) => (await trpcQuery<Cart>(api, "cart.get")).lines.find((l) => l.sku === sku)?.qty ?? 0;

// See cart.spec.ts: parallel Playwright runs clear the shared test-results dir, so traces stay off.
test.use({ trace: "off" });

test("a cart that can't be saved shows a retry notice and stops checkout", async ({ page }) => {
  await registerApi(page, "cart-sync");
  await trpcMutate(page.request, "account.addresses.add", { ...ADDRESS, label: "Home", isDefault: true });
  const [variant] = await pickVariants(page.request, 1);
  await seedCart(page, [variant]);

  // The BFF is unreachable for cart saves.
  const blocked = (url: URL) => url.pathname.includes("cart.setLines");
  await page.route(blocked, (route) => route.abort("failed"));

  await page.getByRole("button", { name: `Increase ${variant.name.toLowerCase()} quantity` }).click();
  const notice = page.getByRole("status").filter({ hasText: "Couldn’t save your cart to your account. Retrying…" });
  await expect(notice).toBeVisible({ timeout: 15_000 });

  // Checkout must not place an order from the stale server cart.
  await page.goto("/checkout");
  await waitForQuote(page);
  const place = page.getByRole("button", { name: /^Place order/ });
  await expect(place).toBeEnabled({ timeout: 20_000 });
  await place.click();
  await expect(page.getByRole("alert").filter({ hasText: "Your latest cart changes couldn’t be saved, so the order wasn’t placed." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();
  expect(await serverQty(page.request, variant.sku)).toBe(1);

  // Once the BFF is back, the retry action saves the device cart and the notice goes away.
  await page.unroute(blocked);
  await page.goto("/cart");
  const retry = page.getByRole("button", { name: "Try again now" });
  if (await retry.isVisible()) await retry.click();
  await expect(notice).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => serverQty(page.request, variant.sku), { timeout: 20_000 }).toBe(2);
});
