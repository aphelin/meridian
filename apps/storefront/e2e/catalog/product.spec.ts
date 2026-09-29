import { mailhogLink, passTurnstile, uniqueEmail } from "../support";
import { deliverPurchase, expect, mutate, registerShopper, test } from "./support";

test.describe("product page", () => {
  test("variant swatches switch the finish and show live stock per variant", async ({ page, admin, fresh }) => {
    test.setTimeout(120_000);
    const piece = await fresh(admin, {
      variants: [
        { label: "Natural oak", material: "oak", onHand: 3 },
        { label: "Dark walnut", material: "walnut", onHand: 0 },
      ],
    });

    await page.goto(`/product/${piece.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: piece.name })).toBeVisible();
    const finishes = page.getByRole("radiogroup", { name: `${piece.name} finish` });
    await expect(finishes.getByRole("radio", { name: "Natural oak" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Only 3 left")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add to cart/ })).toBeEnabled();

    await finishes.getByRole("radio", { name: "Dark walnut, sold out" }).click();
    await expect(finishes.getByRole("radio", { name: "Dark walnut, sold out" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Finish · Dark walnut")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sold out" })).toBeDisabled();

    // live: restocking the walnut finish shows up without a reload (the page polls catalog.stock every 30 s)
    await mutate(admin, "admin.stock.adjust", { sku: piece.variants[1].sku, onHand: 12, reason: "storefront catalog e2e: restock" });
    await expect(page.getByText("In stock", { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(finishes.getByRole("radio", { name: "Dark walnut", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add to cart/ })).toBeEnabled();
  });

  test("catalog sold-out piece shows the Sold out pill on its shop card, a disabled quantity stepper and a struck swatch", async ({ page }) => {
    // sideboard-kiln is seeded at EUR 990 with the catalog soldOut flag
    await page.goto("/shop/storage?min=990&max=990");
    const card = page.getByRole("article", { name: "Kiln" });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText("Sold out")).toBeVisible();
    await expect(card.getByRole("button", { name: "Quick add Kiln" })).toHaveCount(0);

    await card.getByRole("link", { name: "Kiln", exact: true }).click();
    await expect(page).toHaveURL(/\/product\/sideboard-kiln/);
    await expect(page.getByRole("heading", { level: 1, name: "Kiln" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sold out" })).toBeDisabled();
    const stepper = page.getByRole("group", { name: "Quantity" });
    await expect(stepper.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    await expect(stepper.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    const swatch = page.getByRole("radiogroup", { name: "Kiln finish" }).getByRole("radio", { name: "Smoked oak, sold out" });
    await expect(swatch).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("form", { name: "Get an email when it’s back" })).toBeVisible();
  });

  test("sold-out variant takes a back-in-stock alert behind the captcha and emails when restocked", async ({ page, admin, fresh }) => {
    test.setTimeout(150_000);
    const piece = await fresh(admin, { variants: [{ label: "Charcoal wool", material: "wool", colorFamily: "grey", onHand: 0 }] });
    const email = uniqueEmail("stock-alert");

    await page.goto(`/product/${piece.slug}`);
    const form = page.getByRole("form", { name: "Get an email when it’s back" });
    await expect(form).toBeVisible();
    await form.getByLabel("Email").fill(email);
    await passTurnstile(page, form);
    await form.getByRole("button", { name: "Notify me" }).click();
    await expect(page.getByRole("status").filter({ hasText: `We’ll email ${email}` })).toBeVisible();

    await mutate(admin, "admin.stock.adjust", { sku: piece.variants[0].sku, onHand: 6, reason: "storefront catalog e2e: restock for alert" });
    const link = await mailhogLink(email, new RegExp(`/product/${piece.slug}`), { timeoutMs: 90_000 });
    expect(new URL(link).pathname).toBe(`/product/${piece.slug}`);
  });

  test("verified buyer writes a review after delivery; the reviews summary and JSON-LD rating update", async ({ page, admin, fresh }) => {
    test.setTimeout(240_000);
    const piece = await fresh(admin, { variants: [{ label: "Natural oak", onHand: 5 }] });

    // guests are told how reviewing works
    await page.goto(`/product/${piece.slug}`);
    const reviews = page.getByRole("region", { name: "Reviews" });
    await expect(reviews.getByText("Be the first to review")).toBeVisible();
    await expect(reviews.getByRole("link", { name: "Sign in to review it" })).toBeVisible();

    // signed in without a delivered order: not yet
    const user = await registerShopper(page.request, "reviewer");
    await page.reload();
    await expect(reviews.getByText("You can review this piece once your order of it has been delivered.")).toBeVisible();

    await deliverPurchase(page.request, admin, user, piece);
    await page.reload();
    const form = reviews.getByRole("form", { name: "Write a review" });
    // Delivery reaches the review eligibility read model a moment after the order transition.
    await expect(form).toBeVisible({ timeout: 30_000 });

    // validation first, then a real post
    await form.getByRole("button", { name: "Post review" }).click();
    await expect(form.getByText("Choose a rating from 1 to 5 stars.")).toBeVisible();
    await expect(form.getByText("Reviews need at least 20 characters.")).toBeVisible();
    await form.getByRole("radio", { name: "4 stars" }).click();
    await form.getByLabel("Title").fill("Sturdy and quiet");
    await form.getByLabel("Review", { exact: true }).fill("The oak frame feels solid and the seat is deep enough to curl up in.");
    await form.getByRole("button", { name: "Post review" }).click();

    await expect(reviews.getByRole("list", { name: `Reviews of ${piece.name}` }).getByRole("heading", { name: "Sturdy and quiet" })).toBeVisible();
    await expect(reviews.getByText("Based on 1 review")).toBeVisible();
    await expect(reviews.getByText("Thanks, you’ve already reviewed this piece.")).toBeVisible();
    await expect(reviews.getByText(/Verified purchase/)).toBeVisible();

    // the product's JSON-LD carries aggregateRating once the catalog snapshot has the new rating
    await expect
      .poll(
        async () => {
          await page.reload();
          const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
          return JSON.parse(raw ?? "{}").aggregateRating ?? null;
        },
        { timeout: 120_000, intervals: [5_000] },
      )
      .toMatchObject({ "@type": "AggregateRating", ratingValue: 4, reviewCount: 1 });
  });
});
