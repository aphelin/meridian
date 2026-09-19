import { expect, test } from "@playwright/test";
import { expectIndexableMetadata, trpcQuery } from "./helpers";

type Snapshot = { products: { priceCents: number; soldOut: boolean; variants: { id: string; sku: string }[] }[] };
type ShippingOption = { id: string; label: string; priceCents: number; etaDays: [number, number] | null };
type Quote = { shippingOptions: ShippingOption[]; pricing: { subtotalCents: number } };

const euros = (cents: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

test.describe("content pages", () => {
  test("terms and privacy state plainly that this is a demo shop, with metadata and footer links", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await footer.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Terms of use" }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 1, name: "Terms of use" })).toBeVisible();
    await expectIndexableMetadata(page, { title: /Terms of use · Meridian/, path: "/terms" });
    const terms = page.getByRole("main");
    await expect(terms.getByRole("note", { name: "Demo shop" })).toContainText("no card is ever charged");
    await expect(terms.getByText("Payments are sandbox only.")).toBeVisible();
    await expect(terms.getByText("Emails are sandbox only.")).toBeVisible();
    await expect(terms.getByText("No real orders are fulfilled.")).toBeVisible();

    // The "On this page" index jumps to its section.
    await terms.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Your account" }).click();
    await expect(page).toHaveURL(/\/terms#accounts$/);
    await expect(terms.getByRole("heading", { level: 2, name: /Your account/ })).toBeInViewport();

    await page.getByRole("contentinfo").getByRole("link", { name: "Privacy policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
    await expectIndexableMetadata(page, { title: /Privacy policy · Meridian/, path: "/privacy" });
    const privacy = page.getByRole("main");
    await expect(privacy.getByText("Payments are sandbox only.")).toBeVisible();
    await expect(privacy.getByText("Emails are sandbox only.")).toBeVisible();
    await expect(privacy.getByText("No real orders are fulfilled.")).toBeVisible();
    await expect(privacy.getByRole("heading", { name: /Cookies and local storage/ })).toBeVisible();
  });

  test("shipping and returns page matches the live checkout shipping methods and the 30-day returns window", async ({ page }) => {
    // The live prices come from checkout-service through the BFF quote, for a small basket and one past the free threshold.
    const snapshot = await trpcQuery<Snapshot>(page.request, "catalog.snapshot");
    const product = snapshot.products.filter((p) => p.variants.length && p.priceCents >= 5_000).sort((a, b) => a.priceCents - b.priceCents)[0];
    expect(product, "a product to quote").toBeTruthy();
    const line = { sku: product.variants[0].sku, variantId: product.variants[0].id, qty: 1 };
    const quote = (qty: number) => trpcQuery<Quote>(page.request, "checkout.quote", { lines: [{ ...line, qty }], shippingMethod: "standard", country: "DE" });
    const small = await quote(1);
    const large = await quote(20);
    expect(small.pricing.subtotalCents).toBeLessThan(100_000);
    expect(large.pricing.subtotalCents).toBeGreaterThanOrEqual(100_000);
    expect(small.shippingOptions.map((o) => o.id)).toEqual(["standard", "express", "white-glove", "collect"]);

    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "Shipping & returns" }).click();
    await expect(page).toHaveURL(/\/shipping-returns$/);
    await expect(page.getByRole("heading", { level: 1, name: "Shipping & returns" })).toBeVisible();
    await expectIndexableMetadata(page, { title: /Shipping & returns · Meridian/, path: "/shipping-returns" });

    const table = page.getByRole("table", { name: "Delivery options, prices and delivery times" });
    const rows = table.getByRole("row");
    await expect(rows).toHaveCount(1 + small.shippingOptions.length);
    for (const option of small.shippingOptions) {
      const row = rows.filter({ has: page.getByRole("rowheader", { name: new RegExp(`^${option.label}`) }) });
      await expect(row, `${option.label} is listed`).toHaveCount(1);
      await expect(row.getByRole("cell").first()).toHaveText(option.priceCents === 0 ? "Free" : euros(option.priceCents));
      if (option.etaDays) await expect(row.getByRole("cell").nth(1)).toHaveText(`${option.etaDays[0]}–${option.etaDays[1]} working days`);
    }
    // Standard delivery becomes free at the threshold the page states.
    expect(large.shippingOptions.find((o) => o.id === "standard")?.priceCents).toBe(0);
    await expect(page.getByText(`is ${euros(100_000)} or more`)).toBeVisible();

    const returns = page.getByRole("region", { name: /30-day returns/ });
    await expect(returns).toContainText("within 30 days of delivery");
    await expect(returns.getByRole("link", { name: "your orders" })).toHaveAttribute("href", "/orders");
    await expect(page.getByRole("note", { name: "Demo shop" })).toContainText("no real orders are fulfilled");
  });

  test("faq accordion opens and closes answers by mouse and keyboard, with FAQPage structured data", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "FAQ" }).click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.getByRole("heading", { level: 1, name: "Frequently asked questions" })).toBeVisible();
    await expectIndexableMetadata(page, { title: /Frequently asked questions · Meridian/, path: "/faq" });

    const charged = page.getByRole("button", { name: "Will I be charged if I place an order?" });
    await expect(charged).toHaveAttribute("aria-expanded", "false");
    await charged.click();
    await expect(charged).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Payments run in a sandbox, so no card is charged")).toBeVisible();
    await charged.click();
    await expect(charged).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("Payments run in a sandbox, so no card is charged")).toBeHidden();

    const returns = page.getByRole("button", { name: "Can I return something?" });
    await returns.focus();
    await page.keyboard.press("Enter");
    await expect(returns).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Yes, within 30 days of delivery.")).toBeVisible();
    await page.getByRole("link", { name: "How returns work" }).click();
    await expect(page).toHaveURL(/\/shipping-returns#returns$/);

    await page.goBack();
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}") as { "@type"?: string; mainEntity?: { name: string }[] };
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity?.map((q) => q.name)).toContain("Can I return something?");
  });

  test("content pages work at phone width without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of ["/terms", "/privacy", "/shipping-returns", "/faq", "/contact"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} has no horizontal overflow`).toBeLessThanOrEqual(0);
    }
  });
});
