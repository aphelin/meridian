import { expect, test } from "./fixtures";

test("analytics dashboard shows revenue, top products and projection status, and starts a rebuild", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Gross revenue", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Projection status")).toContainText(/Projection|Lag/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Top products" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revenue by day" })).toBeVisible();

  await page.getByRole("combobox", { name: "Period" }).click();
  await page.getByRole("option", { name: "Last 7 days" }).click();
  await expect(page.getByRole("combobox", { name: "Period" })).toHaveText(/Last 7 days/);

  await page.getByRole("button", { name: "Rebuild analytics" }).click();
  const dialog = page.getByRole("dialog", { name: "Rebuild analytics?" });
  await dialog.getByRole("button", { name: "Rebuild now" }).click();
  await expect(page.getByText("Analytics rebuild started")).toBeVisible({ timeout: 20_000 });
  await expect(dialog).toBeHidden();
});
