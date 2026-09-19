import { expect, query, registerShopper, signInApi, test } from "./support";

test.describe("saved items", () => {
  test("saved items sync with the server wishlist across browsers", async ({ page, browser, admin, fresh }) => {
    test.setTimeout(120_000);
    const piece = await fresh(admin, { variants: [{ label: "Natural oak", onHand: 4 }] });
    const user = await registerShopper(page.request, "wishlist");

    // let the signed-in session adopt the (empty) account wishlist before saving
    const adopted = page.waitForResponse((r) => r.url().includes("/api/trpc/") && r.url().includes("wishlist.get"));
    await page.goto(`/product/${piece.slug}`);
    await adopted;
    await page.getByRole("button", { name: `Save ${piece.name}` }).first().click();
    await expect(page.getByRole("button", { name: `Remove ${piece.name} from saved` }).first()).toBeVisible();
    await expect.poll(async () => (await query<{ slugs: string[] }>(page.request, "wishlist.get")).slugs, { timeout: 15_000 }).toContain(piece.slug);

    // another browser signs in to the same account and finds the piece under Saved
    const other = await browser.newContext();
    try {
      const second = await other.newPage();
      await signInApi(second.request, user.email, user.password);
      await second.goto("/saved");
      await expect(second.getByRole("heading", { level: 1, name: "Saved items" })).toBeVisible();
      await expect(second.getByText("1 piece · saved to your account")).toBeVisible();
      const card = second.getByRole("article", { name: piece.name });
      await expect(card).toBeVisible();

      // removing it there removes it from the account
      await card.getByRole("button", { name: `Remove ${piece.name} from saved` }).click();
      await expect(second.getByText("No saved pieces yet")).toBeVisible();
      await expect.poll(async () => (await query<{ slugs: string[] }>(second.request, "wishlist.get")).slugs, { timeout: 15_000 }).not.toContain(piece.slug);
    } finally {
      await other.close();
    }

    // and the first browser adopts the account list on its next visit
    await page.goto("/saved");
    await expect(page.getByText("No saved pieces yet")).toBeVisible();
    await expect(page.getByRole("article", { name: piece.name })).toHaveCount(0);
  });

  test("guest saved items stay on the device with a sign-in prompt", async ({ page }) => {
    await page.goto("/product/holt-sofa");
    await page.getByRole("button", { name: "Save Holt" }).first().click();
    await page.goto("/saved");
    await expect(page.getByText("1 piece · kept on this device")).toBeVisible();
    await expect(page.getByRole("article", { name: "Holt" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });
});
