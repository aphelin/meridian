import { expect, test } from "@playwright/test";

/** Forms speak through the site's own field messages: `noValidate` on the form, the message under the field. */
test.describe("field errors", () => {
  test("sign in submitted empty names both fields, focuses email and clears a message once it is fixed", async ({ page }) => {
    await page.goto("/account");
    const form = page.getByRole("tabpanel", { name: "Sign in" }).locator("form");
    await expect(form).toHaveAttribute("novalidate", "");

    const email = form.getByLabel("Email", { exact: true });
    const password = form.getByLabel("Password", { exact: true });
    await form.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(form.getByText("Enter your email address.")).toBeVisible();
    await expect(form.getByText("Enter your password.")).toBeVisible();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription(/Enter your email address\./);
    await expect(email).toBeFocused();

    await email.fill("shopper@example.com");
    await expect(form.getByText("Enter your email address.")).toBeHidden();
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await expect(form.getByText("Enter your password.")).toBeVisible();
  });

  test("newsletter with a malformed email shows the inline message instead of a browser bubble", async ({ page }) => {
    await page.goto("/");
    const form = page.getByRole("contentinfo").getByRole("form", { name: "Newsletter" });
    await expect(form).toHaveAttribute("novalidate", "");
    const field = form.getByRole("textbox", { name: "Your address for the newsletter" });
    await field.fill("not-an-email");
    await form.getByRole("button", { name: "Sign up" }).click();

    await expect(form.getByText("Enter an email address like name@example.com.")).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toBeFocused();
  });

  test("forgot password with a malformed email shows the inline message instead of a browser bubble", async ({ page }) => {
    await page.goto("/account/forgot-password");
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Send reset link" }) });
    await expect(form).toHaveAttribute("novalidate", "");
    const field = form.getByLabel("Email", { exact: true });
    await field.fill("name@");
    // The submit waits for the security check; the message must not depend on the browser either way.
    await expect(form.getByRole("button", { name: "Send reset link" })).toBeEnabled({ timeout: 20_000 });
    await form.getByRole("button", { name: "Send reset link" }).click();

    await expect(form.getByText("Enter an email address like name@example.com.")).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toHaveCount(0);
  });
});
