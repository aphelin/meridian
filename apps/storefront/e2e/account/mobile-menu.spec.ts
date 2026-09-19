import { register, signIn, stackAdmin, uniqueEmail } from "../support";
import { expect, test } from "./helpers";

test.describe("account: mobile menu sheet", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile menu shows the signed-in shopper's identity, orders and sign out, then a sign in row once signed out", async ({ page }) => {
    const email = uniqueEmail("account-mobile-menu");
    await register(page, { name: "Mira Holloway", email });

    // below `sm` the header hides the account menu, so the sheet carries the account block
    await expect(page.getByRole("button", { name: "Account, signed in as Mira" })).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    const account = sheet.getByRole("region", { name: "Your account" });
    await expect(account).toBeVisible();
    await expect(account.getByText("Mira Holloway")).toBeVisible();
    await expect(account.getByText(email)).toBeVisible();
    await expect(account.getByText("Admin", { exact: true })).toHaveCount(0);
    await expect(account.getByRole("link", { name: "Your account" })).toBeVisible();
    await expect(account.getByRole("link", { name: "Admin dashboard" })).toHaveCount(0);

    await account.getByRole("link", { name: "Your orders" }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(sheet).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    await sheet.getByRole("region", { name: "Your account" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText("You’re signed out")).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(sheet.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Your account" })).toHaveCount(0);
  });

  test("mobile menu shows the Admin badge and the admin dashboard link to admins", async ({ page }) => {
    const admin = stackAdmin();
    await signIn(page, admin.email, admin.password);

    await page.getByRole("button", { name: "Open menu" }).click();
    const account = page.getByRole("dialog", { name: "Menu" }).getByRole("region", { name: "Your account" });
    await expect(account.getByText("Admin", { exact: true })).toBeVisible();
    await expect(account.getByText(admin.email)).toBeVisible();
    await expect(account.getByRole("link", { name: "Your orders" })).toBeVisible();
    await account.getByRole("link", { name: "Admin dashboard" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
