import { expect, test } from "./support";

test.describe("search", () => {
  test("search page offers did you mean for a typo and follows it to the right piece", async ({ page }) => {
    await page.goto("/search?q=hollt");
    await expect(page.getByRole("heading", { level: 1, name: "Results for “hollt”" })).toBeVisible();
    const suggestion = page.getByRole("status").filter({ hasText: "Did you mean" });
    await expect(suggestion).toBeVisible();
    // typo tolerance already shows the close match while offering the corrected query
    await expect(page.getByRole("article", { name: "Holt" })).toBeVisible();

    await suggestion.getByRole("link", { name: "Holt" }).click();
    await expect(page).toHaveURL(/\/search\?q=Holt/);
    await expect(page.getByRole("heading", { level: 1, name: "Results for “Holt”" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Did you mean" })).toHaveCount(0);
    await expect(page.getByRole("article", { name: "Holt" })).toBeVisible();
  });

  test("search page typing updates results and the shareable URL, with an empty state", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByText("Popular searches")).toBeVisible();
    const box = page.getByRole("searchbox", { name: "Search the collection" });
    await box.fill("walnut");
    await expect(page).toHaveURL(/\/search\?q=walnut/);
    await expect(page.getByRole("article").first()).toBeVisible();
    await expect(page.getByText(/^\d+ pieces?$/)).toBeVisible();

    await box.fill("zzqxj vbnmw");
    await expect(page.getByText("No pieces match “zzqxj vbnmw”")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
  });

  test("header search palette suggests pieces as you type and opens the one picked", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("banner").getByRole("button", { name: "Search", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").fill("hol");
    const option = dialog.getByRole("option", { name: /Holt/ });
    await expect(option).toBeVisible();
    await expect(dialog.getByRole("option", { name: /See all results for “hol”/ })).toBeVisible();
    await option.click();
    await expect(page).toHaveURL(/\/product\/holt-sofa$/);
    await expect(page.getByRole("heading", { level: 1, name: "Holt" })).toBeVisible();
  });
});
