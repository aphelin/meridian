import { expect, test } from "@playwright/test";
import { signIn } from "../support";
import { admin, pickVariants, registerApi, seedCart, trpcMutate, trpcQuery } from "./helpers";

type Cart = { lines: { sku: string; qty: number }[] };

const serverCart = async (api: import("@playwright/test").APIRequestContext) => (await trpcQuery<Cart>(api, "cart.get")).lines.map((l) => `${l.sku}:${l.qty}`).sort().join(",");

// The shared test-results dir is cleared by any other Playwright run starting on this checkout (parallel storefront
// leaves), which breaks trace recording mid-test; these specs therefore don't record traces.
test.use({ trace: "off" });

test.describe("cart", () => {
  test("server cart merges the guest cart on sign in and follows the shopper cross-device", async ({ page, browser, baseURL }) => {
    const [first, second] = await pickVariants(page.request, 2);
    // Device A: a signed-in shopper with one piece in the account cart.
    const shopper = await registerApi(page, "merge");
    await seedCart(page, [first]);

    // Device B: a guest adds another piece, then signs in to the same account.
    const deviceB = await browser.newContext({ baseURL });
    try {
      const other = await deviceB.newPage();
      await seedCart(other, [second]);
      await signIn(other, shopper.email, shopper.password);
      const merged = [`${first.sku}:1`, `${second.sku}:1`].sort().join(",");
      await expect.poll(() => serverCart(other.request), { timeout: 20_000 }).toBe(merged);
      await other.goto("/cart");
      await expect(other.getByRole("link", { name: first.name, exact: true })).toBeVisible();
      await expect(other.getByRole("link", { name: second.name, exact: true })).toBeVisible();
      await expect(other.getByRole("button", { name: "Cart, 2 items" })).toBeVisible();
    } finally {
      await deviceB.close();
    }

    // Back on device A, opening the cart picks up the merged server cart.
    await page.goto("/cart");
    await expect(page.getByRole("link", { name: second.name, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: first.name, exact: true })).toBeVisible();
  });

  test("cart drawer syncs quantity changes to the server cart and warns about low stock", async ({ page }) => {
    const [variant] = await pickVariants(page.request, 1);
    await seedCart(page, [variant]);
    const stock = await trpcQuery<{ sku: string; available: number }[]>(page.request, "catalog.stock", { skus: [variant.sku] });
    const adminApi = await admin();
    const available = stock[0]?.available ?? 0;
    await trpcMutate(adminApi, "admin.stock.adjust", { sku: variant.sku, delta: 2 - available, reason: "e2e low stock warning" });
    try {
      await page.reload();
      await page.getByRole("button", { name: "Cart, 1 item" }).click();
      const drawer = page.getByRole("dialog", { name: /Your cart/ });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText("Only 2 left")).toBeVisible();

      const increase = drawer.getByRole("button", { name: `Increase ${variant.name} quantity` });
      await increase.click();
      await expect(drawer.getByRole("group", { name: `${variant.name} quantity` })).toContainText("2");
      await expect(increase).toBeDisabled();
      await expect.poll(() => serverCart(page.request), { timeout: 10_000 }).toBe(`${variant.sku}:2`);

      // Stock drops below the quantity in the cart: checkout is blocked until the cart is adjusted.
      await trpcMutate(adminApi, "admin.stock.adjust", { sku: variant.sku, delta: -1, reason: "e2e low stock warning" });
      await page.goto("/cart");
      await expect(page.getByText("Only 1 available. Lower the quantity to check out.")).toBeVisible();
      await expect(page.getByRole("main").getByRole("button", { name: "Checkout" })).toBeDisabled();
      await page.getByRole("main").getByRole("button", { name: `Decrease ${variant.name} quantity` }).click();
      await expect(page.getByRole("main").getByRole("link", { name: "Checkout" })).toBeVisible();

      await page.getByRole("main").getByRole("button", { name: `Remove ${variant.name} ${variant.variantLabel}` }).click();
      await expect(page.getByText("Your cart is empty")).toBeVisible();
      await expect.poll(() => serverCart(page.request), { timeout: 10_000 }).toBe("");
    } finally {
      const now = await trpcQuery<{ sku: string; available: number }[]>(page.request, "catalog.stock", { skus: [variant.sku] });
      await trpcMutate(adminApi, "admin.stock.adjust", { sku: variant.sku, delta: 20 - (now[0]?.available ?? 0), reason: "e2e restore stock" });
    }
  });
});
