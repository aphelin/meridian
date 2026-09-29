import { expect, test } from "@playwright/test";
import { uniqueEmail } from "../support";
import { fillGuestDetails, paymentElement, payWithStripeCard, pickVariants, seedCart, submitCheckout, trpcQuery, waitForQuote } from "./helpers";

// Real Stripe test mode: payment-service creates the PaymentIntent, the storefront renders Stripe's Payment Element,
// and the order is confirmed only when Stripe's signed webhook reaches payment-service (`stripe listen` in dev).
test.use({ trace: "off" });
test.describe.configure({ timeout: 180_000 });

async function reachPaymentStep(page: import("@playwright/test").Page, tag: string) {
  const [variant] = await pickVariants(page.request, 1);
  await seedCart(page, [variant]);
  await page.getByRole("main").getByRole("link", { name: "Checkout" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible({ timeout: 60_000 });
  const email = uniqueEmail(tag);
  await fillGuestDetails(page, email);
  await waitForQuote(page);
  await submitCheckout(page, { guest: true });
  await expect(page.getByRole("heading", { name: "Card payment (Stripe test mode)" }), "Stripe test mode is the active payment provider").toBeVisible({ timeout: 30_000 });
  return { variant, email };
}

test.describe("Stripe Payment Element", () => {
  // needs real Stripe test keys and `stripe listen` forwarding webhooks; without them payment-service uses the local sandbox
  test.skip(!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET, "Stripe test keys are not configured");

  test("a guest pays with test card 4242 4242 4242 4242 and the order page shows the order paid", async ({ page }) => {
    const { variant, email } = await reachPaymentStep(page, "stripe-pay");

    await payWithStripeCard(page, "4242 4242 4242 4242");

    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+\?paid=1$/, { timeout: 60_000 });
    await expect(page.getByText("Thank you, your payment went through and the order is confirmed.")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("main").getByText("Paid", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
    await expect(page.getByRole("link", { name: variant.name })).toBeVisible();
    const orderId = new URL(page.url()).pathname.split("/").pop()!;
    expect((await trpcQuery<{ status: string }>(page.request, "orders.byId", { id: orderId })).status).toBe("paid");
  });

  test("a declined card shows Stripe's message inline and the shopper can retry on the same order", async ({ page }) => {
    await reachPaymentStep(page, "stripe-decline");

    await payWithStripeCard(page, "4000 0000 0000 0002");
    await expect(page.getByRole("alert").filter({ hasText: /declined/i })).toBeVisible({ timeout: 45_000 });
    await expect(page).not.toHaveURL(/\/orders\//);

    // Same PaymentIntent, a good card this time.
    await paymentElement(page).locator('input[name="number"]').fill("4242 4242 4242 4242");
    await page.getByRole("button", { name: /^Pay €[\d,.]+$/ }).click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+\?paid=1$/, { timeout: 60_000 });
    await expect(page.getByRole("main").getByText("Paid", { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  });
});
