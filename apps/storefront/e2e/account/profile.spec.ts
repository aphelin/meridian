import { register, uniqueEmail } from "../support";
import { accountMenu, expect, expectEmail, mutate, query, submitSignIn, test, TrpcFailure } from "./helpers";

test.describe("account: profile, addresses and deletion", () => {
  test("profile edit renames the shopper in the greeting and the account menu", async ({ page }) => {
    await register(page, { name: "Iris Before", email: uniqueEmail("account-profile") });
    await page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Profile & security" }).click();
    await expect(page).toHaveURL(/\/account\/profile$/);

    const name = page.getByLabel("Full name");
    await expect(name).toHaveValue("Iris Before");
    const save = page.getByRole("button", { name: "Save profile" });
    await expect(save).toBeDisabled();
    await name.fill("Juno Brightwater");
    await save.click();
    await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hi, Juno" })).toBeVisible();
    await expect(accountMenu(page, "Juno")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Juno Brightwater", { timeout: 20_000 });
    expect((await query<{ name: string }>(page.request, "auth.me")).name).toBe("Juno Brightwater");
  });

  test("saved addresses: add, edit, make default and delete an address with confirmation", async ({ page }) => {
    test.setTimeout(120_000);
    await register(page, { name: "Aksel Address", email: uniqueEmail("account-address") });
    await page.goto("/account/addresses");
    await expect(page.getByRole("heading", { name: "No saved addresses yet" })).toBeVisible({ timeout: 20_000 });

    // First address: always the default.
    await page.getByRole("button", { name: "Add address" }).click();
    let dialog = page.getByRole("dialog", { name: "Add an address" });
    await dialog.getByLabel("Label (optional)").fill("Home");
    await dialog.getByLabel("Full name").fill("Aksel Holm");
    await dialog.getByLabel("Address", { exact: true }).fill("Vesterbrogade 8");
    await dialog.getByLabel("Postal code").fill("1620");
    await dialog.getByLabel("City").fill("Copenhagen");
    await dialog.getByRole("combobox", { name: "Country" }).click();
    await page.getByRole("option", { name: "Denmark" }).click();
    await expect(dialog.getByRole("checkbox", { name: "Use as my default address" })).toBeChecked();
    await dialog.getByRole("button", { name: "Add address" }).click();
    await expect(dialog).toBeHidden();

    const cards = page.getByRole("list", { name: "Saved addresses" }).getByRole("listitem");
    const home = cards.filter({ has: page.getByRole("heading", { name: "Home" }) });
    await expect(home).toContainText("Vesterbrogade 8");
    await expect(home).toContainText("Denmark");
    await expect(home.getByText("Default", { exact: true })).toBeVisible();

    // Second address, not default.
    await page.getByRole("button", { name: "Add address" }).click();
    dialog = page.getByRole("dialog", { name: "Add an address" });
    await dialog.getByLabel("Label (optional)").fill("Studio");
    await dialog.getByLabel("Full name").fill("Aksel Holm");
    await dialog.getByLabel("Address", { exact: true }).fill("Torstraße 12");
    await dialog.getByLabel("Postal code").fill("10119");
    await dialog.getByLabel("City").fill("Berlin");
    await expect(dialog.getByRole("checkbox", { name: "Use as my default address" })).not.toBeChecked();
    await dialog.getByRole("button", { name: "Add address" }).click();
    await expect(dialog).toBeHidden();
    const studio = cards.filter({ has: page.getByRole("heading", { name: "Studio" }) });
    await expect(studio).toContainText("Germany");
    await expect(studio.getByText("Default", { exact: true })).toHaveCount(0);
    await expect(page.getByText("2 of 10 saved.")).toBeVisible();

    // Move the default.
    await page.getByRole("button", { name: "Make Studio the default address" }).click();
    await expect(studio.getByText("Default", { exact: true })).toBeVisible();
    await expect(home.getByText("Default", { exact: true })).toHaveCount(0);

    // Edit.
    await page.getByRole("button", { name: "Edit Home" }).click();
    dialog = page.getByRole("dialog", { name: "Edit address" });
    await expect(dialog.getByLabel("City")).toHaveValue("Copenhagen");
    await dialog.getByLabel("City").fill("Aarhus");
    await dialog.getByLabel("Postal code").fill("8000");
    await dialog.getByRole("button", { name: "Save address" }).click();
    await expect(dialog).toBeHidden();
    await expect(home).toContainText("8000 Aarhus");

    // Delete, cancelling once first.
    await page.getByRole("button", { name: "Delete Home" }).click();
    dialog = page.getByRole("dialog", { name: "Delete this address?" });
    await dialog.getByRole("button", { name: "Keep address" }).click();
    await expect(dialog).toBeHidden();
    await expect(home).toHaveCount(1);
    await page.getByRole("button", { name: "Delete Home" }).click();
    await dialog.getByRole("button", { name: "Delete address" }).click();
    await expect(dialog).toBeHidden();
    await expect(home).toHaveCount(0);
    await expect(cards).toHaveCount(1);

    const stored = await query<{ label: string | null; isDefault: boolean; country: string }[]>(page.request, "account.addresses.list");
    expect(stored).toEqual([expect.objectContaining({ label: "Studio", isDefault: true, country: "DE" })]);

    // The overview shows the default address.
    await page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Overview" }).click();
    await expect(page.getByRole("region", { name: "Default address" })).toContainText("Torstraße 12");
  });

  test("delete account asks for the password, signs out and the account can no longer sign in", async ({ page }) => {
    test.setTimeout(120_000);
    const shopper = await register(page, { name: "Dana Delete", email: uniqueEmail("account-delete") });
    await mutate(page.request, "account.addresses.add", { fullName: "Dana Delete", line1: "Main 1", line2: null, city: "Tbilisi", postalCode: "0105", country: "GE", phone: null });

    await page.goto("/account/profile");
    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    const confirm = dialog.getByRole("button", { name: "Delete permanently" });
    // An empty password is caught under the field before anything is sent.
    await confirm.click();
    await expect(dialog.getByText("Enter your password.", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Your password", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await dialog.getByLabel("Your password", { exact: true }).fill("wrong-password-000");
    await confirm.click();
    await expect(dialog.getByRole("alert").filter({ hasText: "The password you entered is incorrect." })).toBeVisible();

    await dialog.getByRole("button", { name: "Keep my account" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Hi, Dana" })).toBeVisible();

    await page.getByRole("button", { name: "Delete account" }).click();
    await dialog.getByLabel("Your password", { exact: true }).fill(shopper.password);
    await confirm.click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.getByRole("banner").getByRole("link", { name: "Account" })).toBeVisible();
    expect(await query(page.request, "auth.me")).toBeFalsy();
    await expectEmail(shopper.email, /account has been deleted/);

    await expect(mutate(page.request, "auth.login", { email: shopper.email, password: shopper.password })).rejects.toMatchObject({ code: "UNAUTHORIZED" } satisfies Partial<TrpcFailure>);
    await page.goto("/account");
    await submitSignIn(page, shopper.email, shopper.password);
    await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
  });

  test("account routes send noindex, nofollow robots metadata and keep one-time tokens out of the referrer", async ({ request }) => {
    for (const path of ["/account", "/account/profile", "/account/addresses", "/account/forgot-password", "/account/reset-password?token=abc", "/account/verify-email?token=abc"]) {
      const html = await (await request.get(path, { timeout: 60_000 })).text();
      expect(html, path).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    }
    for (const path of ["/account/reset-password?token=abc", "/account/verify-email?token=abc"]) {
      const html = await (await request.get(path)).text();
      expect(html, path).toMatch(/<meta name="referrer" content="no-referrer"/);
    }
  });
});
