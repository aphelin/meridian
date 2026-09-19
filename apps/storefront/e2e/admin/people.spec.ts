import { uniqueEmail } from "../support";
import { expect, guestApi, test, withCaptcha } from "./fixtures";

test("customer search finds a newly registered shopper", async ({ page }) => {
  const email = uniqueEmail("admin-find");
  const shopper = await guestApi();
  try {
    await withCaptcha(shopper, "auth.register", { name: "Saga Nordin", email, password: "e2e-password-123" });
  } finally {
    await shopper.dispose();
  }

  await page.goto("/admin/customers");
  await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("searchbox", { name: "Search customers" }).fill(email);
  await page.getByRole("search", { name: "Search customers" }).getByRole("button", { name: "Search" }).click();
  const table = page.getByRole("table", { name: "Customers" });
  await expect(table.getByRole("row")).toHaveCount(2, { timeout: 20_000 });
  const row = table.getByRole("row").nth(1);
  await expect(row).toContainText("Saga Nordin");
  await expect(row.getByRole("link", { name: email })).toBeVisible();
  await expect(row).toContainText("Unverified");

  await page.getByRole("searchbox", { name: "Search customers" }).fill(`nobody-${email}`);
  await page.getByRole("search", { name: "Search customers" }).getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("No customers match")).toBeVisible({ timeout: 20_000 });
});

test("email delivery log filters by template, and the contact message is listed", async ({ page }) => {
  const email = uniqueEmail("admin-contact");
  const message = `E2E admin contact message ${Date.now()}: does the oak table come in walnut?`;
  const visitor = await guestApi();
  try {
    await withCaptcha(visitor, "contact.send", { name: "Pia Lund", email, topic: "product", orderNumber: null, message });
  } finally {
    await visitor.dispose();
  }

  await page.goto("/admin/emails");
  await expect(page.getByRole("heading", { level: 1, name: "Emails" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("combobox", { name: "Template" }).click();
  await page.getByRole("option", { name: "contact-received" }).click();
  const table = page.getByRole("table", { name: "Email deliveries" });
  const row = table.getByRole("row").filter({ hasText: email });
  // The log refreshes itself every 10 s while the email is rendered and sent.
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(row).toContainText("contact-received");
  await expect(table.getByText(/^(verify-email|password-reset|order-confirmation|newsletter-confirm)$/)).toHaveCount(0);
  await expect(row).toContainText(/Sent|Queued|Failed, retrying/);
  await expect(row.getByRole("button", { name: "Copy correlation id" })).toBeVisible();

  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Messages" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
  const item = page.getByRole("list", { name: "Contact messages" }).getByRole("listitem").filter({ hasText: message });
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(item.getByRole("link", { name: email })).toBeVisible();
  await expect(item).toContainText("A product");
});
