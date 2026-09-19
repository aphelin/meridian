import { expect, test } from "@playwright/test";
import { uniqueEmail } from "../support";
import { ADDRESS, fillAddress, fillGuestDetails, payOnPaymentStep, pickVariants, registerApi, seedCart, submitCheckout, trpcMutate, waitForQuote } from "./helpers";

const whole = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (cents: number) => (cents % 100 === 0 ? whole.format(cents / 100) : exact.format(cents / 100));

const breakdown = (page: import("@playwright/test").Page) => page.getByLabel("Price breakdown");

// The shared test-results dir is cleared by any other Playwright run starting on this checkout (parallel storefront
// leaves), which breaks trace recording mid-test; these specs therefore don't record traces.
test.use({ trace: "off" });

test.describe("checkout", () => {
  test("guest checks out and pays (Stripe test card or local sandbox), then the order page confirms it is paid", async ({ page }) => {
    const [variant] = await pickVariants(page.request, 1);
    await seedCart(page, [variant]);

    await page.getByRole("main").getByRole("link", { name: "Checkout" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible({ timeout: 60_000 });
    const email = uniqueEmail("guest");
    await fillGuestDetails(page, email);
    await waitForQuote(page);
    await expect(page.getByText("Checking out as a guest")).toBeVisible();
    await submitCheckout(page, { guest: true });

    await expect(page.getByRole("list", { name: "Checkout progress" }).getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step");
    await payOnPaymentStep(page);

    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+\?paid=1$/, { timeout: 45_000 });
    await expect(page.getByText("Thank you, your payment went through and the order is confirmed.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1, name: /^Order M-/ })).toBeVisible();
    await expect(page.getByRole("main").getByText("Paid", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
    await expect(page.getByRole("link", { name: variant.name })).toBeVisible();
    // The cart was emptied once the order was placed.
    await expect(page.getByRole("button", { name: "Cart", exact: true })).toBeVisible();
  });

  test("shipping method cards show price and ETA and update the live quote", async ({ page }) => {
    const [variant] = await pickVariants(page.request, 1);
    await seedCart(page, [variant]);
    await page.goto("/checkout");
    await waitForQuote(page);

    const standard = page.getByRole("radio", { name: /^Standard delivery, €49, 5–10 working days$/ });
    const express = page.getByRole("radio", { name: /^Express delivery, €99, 2–4 working days$/ });
    await expect(standard).toBeChecked();
    await expect(express).toBeVisible();
    await expect(page.getByRole("radio", { name: /^White-glove/i })).toBeVisible();
    await expect(breakdown(page).getByText(money(variant.priceCents + 4900), { exact: true })).toBeVisible();

    await express.click();
    await expect(express).toBeChecked();
    await expect(breakdown(page).getByText("Express delivery")).toBeVisible();
    await expect(breakdown(page).getByText(money(9900), { exact: true })).toBeVisible();
    await expect(breakdown(page).getByText(money(variant.priceCents + 9900), { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Place order · ${money(variant.priceCents + 9900)}` })).toBeVisible();
  });

  test("live quote shows the VAT for the delivery country", async ({ page }) => {
    const [variant] = await pickVariants(page.request, 1);
    await seedCart(page, [variant]);
    await page.goto("/checkout");
    await waitForQuote(page);

    // Prices include VAT: the line shows the VAT contained in the total at the destination country's rate.
    const total = variant.priceCents + 4900;
    const vat = (rate: number) => money(Math.round((total * rate) / (100 + rate)));
    const row = (rate: number) => breakdown(page).getByRole("definition").filter({ hasText: new RegExp(`^${vat(rate).replace(/[.]/g, "\\.")}$`) });
    await expect(breakdown(page).getByText("Includes VAT (19%)")).toBeVisible();
    await expect(row(19)).toBeVisible();

    await page.getByRole("combobox", { name: "Country" }).click();
    await page.getByRole("option", { name: "Netherlands" }).click();
    await expect(breakdown(page).getByText("Includes VAT (21%)")).toBeVisible();
    await expect(row(21)).toBeVisible();

    await page.getByRole("combobox", { name: "Country" }).click();
    await page.getByRole("option", { name: "United States" }).click();
    await expect(breakdown(page).getByText("Includes VAT (0%)")).toBeVisible();
    await expect(breakdown(page).getByText(money(total), { exact: true })).toBeVisible();
  });

  test("coupon code is applied on Enter with an inline message", async ({ page }) => {
    const [variant] = await pickVariants(page.request, 1);
    await seedCart(page, [variant]);
    await page.goto("/checkout");
    await waitForQuote(page);

    const code = page.getByLabel("Discount code");
    await code.fill("NOPE-2026");
    await code.press("Enter");
    await expect(code).toHaveAttribute("aria-invalid", "true");
    await expect(breakdown(page).getByText("Discount", { exact: true })).toBeVisible();

    await code.fill("north-10");
    await code.press("Enter");
    const discount = Math.round(variant.priceCents * 0.1);
    await expect(page.getByText(/NORTH-10 applied/)).toBeVisible();
    await expect(code).not.toHaveAttribute("aria-invalid", "true");
    await expect(breakdown(page).getByText("Discount (NORTH-10)")).toBeVisible();
    await expect(breakdown(page).getByText(`−${money(discount)}`)).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).click();
    await expect(breakdown(page).getByText("Discount", { exact: true })).toBeVisible();
  });

  test("signed-in shopper checks out with a saved address", async ({ page }) => {
    const shopper = await registerApi(page, "saved-address");
    await trpcMutate(page.request, "account.addresses.add", { ...ADDRESS, fullName: "Mira Holm", line1: "Vesterbrogade 8", city: "Copenhagen", postalCode: "1620", country: "DK", label: "Studio", isDefault: true });
    const [variant] = await pickVariants(page.request, 1);
    await seedCart(page, [variant]);
    await page.goto("/checkout");

    await expect(page.getByText(`Signed in as ${shopper.email}`)).toBeVisible();
    const saved = page.getByRole("radio", { name: "Studio: Mira Holm, Vesterbrogade 8, Copenhagen" });
    await expect(saved).toBeChecked();
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await expect(page.getByTestId("turnstile-token")).toHaveCount(0);
    // Danish VAT (the default 20% rate) follows the saved address.
    await expect(breakdown(page).getByText(/Includes VAT \(\d+%\)/)).toBeVisible();

    await page.getByRole("radio", { name: "Use a new address" }).click();
    await expect(page.getByLabel("Full name")).toBeVisible();
    await fillAddress(page);
    await saved.click();
    await expect(page.getByLabel("Full name")).toHaveCount(0);

    await submitCheckout(page, { guest: false });
    await payOnPaymentStep(page);
    await expect(page.getByRole("main").getByText("Paid", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    const details = page.getByRole("complementary", { name: "Order details" });
    await expect(details.getByText("Vesterbrogade 8")).toBeVisible();
    await expect(details.getByText("Denmark")).toBeVisible();
  });
});
