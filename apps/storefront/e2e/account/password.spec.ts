import { onStore, passTurnstile, register, signIn, uniqueEmail } from "../support";
import { accountMenu, createShopper, expect, expectEmail, mailhogLinks, mutate, submitSignIn, test, TrpcFailure } from "./helpers";

test.describe("account: passwords", () => {
  test("forgot password emails a reset link; reset password signs in with the new password and the link works once", async ({ page, playwright, baseURL }) => {
    test.setTimeout(150_000);
    const api = await playwright.request.newContext({ baseURL });
    const shopper = await createShopper(api, "forgot", "Freya Forgot");
    const newPassword = "reset-password-456";

    await page.goto("/account");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Email").fill(shopper.email);
    await passTurnstile(page);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await expect(page.getByText(`If an account exists for ${shopper.email}`)).toBeVisible();

    const [link] = await mailhogLinks(shopper.email, /\/account\/reset-password\?token=/);
    await page.goto(onStore(link));
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/token=/);

    // Mismatched confirmation is caught before anything is sent.
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill("something-else-1");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("The passwords don’t match.")).toBeVisible();

    await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
    await expectEmail(shopper.email, /Your password was changed/);

    // The old password no longer works; the new one does.
    await expect(mutate(api, "auth.login", { email: shopper.email, password: shopper.password })).rejects.toMatchObject({ code: "UNAUTHORIZED" } satisfies Partial<TrpcFailure>);
    await api.dispose();
    await signIn(page, shopper.email, newPassword);
    await expect(accountMenu(page, "Freya")).toBeVisible();

    // The emailed link is single use.
    await page.goto(onStore(link));
    await page.getByLabel("New password", { exact: true }).fill("another-password-789");
    await page.getByLabel("Confirm new password", { exact: true }).fill("another-password-789");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "invalid or has already been used" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });

  test("change password refuses a wrong current password, keeps this session and only the new password signs in", async ({ page }) => {
    test.setTimeout(120_000);
    const shopper = await register(page, { name: "Pavel Change", email: uniqueEmail("account-change") });
    const newPassword = "changed-password-456";

    await page.goto("/account/profile");
    await expect(page.getByRole("heading", { name: "Password", exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Current password", { exact: true }).fill("wrong-password-000");
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The password you entered is incorrect." })).toBeVisible();

    await page.getByLabel("Current password", { exact: true }).fill(shopper.password);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();
    await expect(page.getByLabel("Current password", { exact: true })).toHaveValue("");
    await expectEmail(shopper.email, /Your password was changed/);

    // This browser's session survives the change.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Hi, Pavel" })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 });
    await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
    await submitSignIn(page, shopper.email, shopper.password);
    await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hi, Pavel" })).toBeVisible({ timeout: 20_000 });
  });
});
