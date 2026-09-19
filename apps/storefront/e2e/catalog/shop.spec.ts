import { expect, mutate, query, test, uniquePriceCents } from "./support";

const euros = (cents: number) => String(cents / 100);

test.describe("shop listing", () => {
  test("shop filters by price, colour and material with facet counts and keeps the filters in the URL", async ({ page, admin, fresh }) => {
    const price = uniquePriceCents();
    const pink = await fresh(admin, { priceCents: price, variants: [{ label: "Blush velvet", colorFamily: "pink", material: "velvet", onHand: 4 }] });
    const green = await fresh(admin, { priceCents: price, variants: [{ label: "Moss wool", colorFamily: "green", material: "wool", onHand: 4 }] });

    await page.goto("/shop");
    await expect(page.getByRole("heading", { level: 1, name: "All furniture" })).toBeVisible();

    // price: the popover's minimum and maximum fields narrow the listing to this test's two pieces
    await page.getByRole("button", { name: "Price", exact: true }).click();
    await page.getByLabel("Minimum price (€)").fill(euros(price));
    await page.getByLabel("Maximum price (€)").fill(euros(price));
    await page.getByRole("button", { name: "Apply price" }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(new RegExp(`min=${euros(price)}&max=${euros(price)}`));
    await expect(page.getByText("2 pieces", { exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: pink.name })).toBeVisible();
    await expect(page.getByRole("article", { name: green.name })).toBeVisible();

    // colour: facet counts are shown per colour; picking pink leaves only the pink piece
    await page.getByRole("button", { name: "Colour", exact: true }).click();
    const colours = page.getByRole("group", { name: "Colour" });
    await expect(colours.getByRole("button", { name: "Green, 1 piece" })).toBeVisible();
    await colours.getByRole("button", { name: "Pink, 1 piece" }).click();
    await expect(colours.getByRole("button", { name: "Pink, 1 piece" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/colour=pink/);
    await expect(page.getByText("1 piece", { exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: pink.name })).toBeVisible();
    await expect(page.getByRole("article", { name: green.name })).toBeHidden();

    // material: velvet matches the pink piece; the trigger shows how many are selected
    await page.getByRole("button", { name: "Material", exact: true }).click();
    await page.getByRole("group", { name: "Material" }).getByRole("button", { name: /^Velvet, 1 piece/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Material, 1 selected" })).toBeVisible();
    await expect(page).toHaveURL(/material=velvet/);
    await expect(page.getByRole("article", { name: pink.name })).toBeVisible();

    // the URL restores the whole filter state on reload
    await page.reload();
    await expect(page.getByRole("button", { name: "Remove filter Pink" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove filter Velvet" })).toBeVisible();
    await expect(page.getByRole("article", { name: pink.name })).toBeVisible();
    await expect(page.getByRole("article", { name: green.name })).toBeHidden();

    // removing the chips widens the listing again; the price filter keeps it to this test's pieces
    await page.getByRole("button", { name: "Remove filter Velvet" }).click();
    await page.getByRole("button", { name: "Remove filter Pink" }).click();
    await expect(page.getByRole("article", { name: green.name })).toBeVisible();
    await expect(page).not.toHaveURL(/colour=|material=/);
  });

  test("in-stock only toggle hides sold-out pieces and shows the empty state", async ({ page, admin, fresh }) => {
    const soldOut = await fresh(admin, { variants: [{ label: "Natural oak", onHand: 0 }] });

    await page.goto(`/shop/seating?min=${euros(soldOut.priceCents)}&max=${euros(soldOut.priceCents)}`);
    const card = page.getByRole("article", { name: soldOut.name });
    await expect(card).toBeVisible();
    await expect(card.getByText("Sold out")).toBeVisible();
    await expect(card.getByRole("button", { name: `Quick add ${soldOut.name}` })).toHaveCount(0);

    await page.getByRole("switch", { name: "In stock only" }).click();
    await expect(page).toHaveURL(/stock=in/);
    await expect(page.getByText("Nothing matches those filters")).toBeVisible();
    await expect(page.getByRole("article", { name: soldOut.name })).toBeHidden();

    await page.getByRole("button", { name: "Remove filter In stock" }).click();
    await expect(page.getByRole("article", { name: soldOut.name })).toBeVisible();
    await expect(page.getByRole("switch", { name: "In stock only" })).not.toBeChecked();
  });

  test("newest sort lists the most recently published piece first, price sort reorders", async ({ page, admin, fresh }) => {
    const price = uniquePriceCents();
    const older = await fresh(admin, { priceCents: price + 100, variants: [{ label: "Oak", onHand: 3 }] });
    const newer = await fresh(admin, { priceCents: price, variants: [{ label: "Oak", onHand: 3 }] });

    await page.goto(`/shop?min=${euros(price)}&max=${euros(price + 100)}`);
    await expect(page.getByText("2 pieces", { exact: true })).toBeVisible();

    await page.getByRole("combobox", { name: "Sort pieces" }).click();
    await page.getByRole("option", { name: "Newest" }).click();
    await expect(page).toHaveURL(/sort=newest/);
    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute("aria-label", newer.name);
    await expect(cards.nth(1)).toHaveAttribute("aria-label", older.name);

    await page.getByRole("combobox", { name: "Sort pieces" }).click();
    await page.getByRole("option", { name: "Price, high to low" }).click();
    await expect(page).toHaveURL(/sort=price-desc/);
    await expect(cards.nth(0)).toHaveAttribute("aria-label", older.name);
    await expect(cards.nth(1)).toHaveAttribute("aria-label", newer.name);
  });

  test("load more fetches the next cursor page without duplicates", async ({ page, admin }) => {
    const first = await query<{ total: number; nextCursor: string | null }>(admin, "search.products", { sort: "featured", limit: 16 });
    expect(first.nextCursor, "the collection has more than one page").toBeTruthy();

    await page.goto("/shop");
    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(16);
    await expect(page.getByText(new RegExp(`^Showing 16 of \\d+$`))).toBeVisible();

    const load = page.getByRole("button", { name: "Load more" });
    await load.click();
    await expect.poll(() => cards.count()).toBeGreaterThan(16);
    const count = await cards.count();
    await expect(page.getByText(new RegExp(`^Showing ${count} of \\d+$`))).toBeVisible();
    const names = await cards.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    expect(new Set(names).size).toBe(names.length);
  });

  test("quick add from a product card adds the in-stock finish to the cart", async ({ page, admin, fresh }) => {
    const piece = await fresh(admin, {
      variants: [
        { label: "Ink velvet", material: "velvet", colorFamily: "blue", onHand: 0 },
        { label: "Walnut", material: "walnut", onHand: 5 },
      ],
    });

    await page.goto(`/shop?min=${euros(piece.priceCents)}&max=${euros(piece.priceCents)}`);
    const card = page.getByRole("article", { name: piece.name });
    await expect(card).toBeVisible();
    // the card shows the sold-out finish first; quick add still picks the finish that is in stock
    await card.getByRole("button", { name: `Quick add ${piece.name}` }).click();
    // the cart sheet opens; close it and the header count shows the line
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "Cart, 1 item" })).toBeVisible();

    const walnut = piece.variants[1];
    await expect
      .poll(async () => (await query<{ lines: { sku: string; qty: number }[] }>(page.request, "cart.get")).lines.map((l) => `${l.sku}×${l.qty}`), { timeout: 20_000 })
      .toEqual([`${walnut.sku}×1`]);
  });

  test("quick add on a piece whose finishes all sold out after the page loaded explains it is sold out", async ({ page, admin, fresh }) => {
    const piece = await fresh(admin, { variants: [{ label: "Oak", onHand: 2 }] });
    await page.goto(`/shop?min=${euros(piece.priceCents)}&max=${euros(piece.priceCents)}`);
    const card = page.getByRole("article", { name: piece.name });
    await expect(card.getByRole("button", { name: `Quick add ${piece.name}` })).toBeVisible();

    await mutate(admin, "admin.stock.adjust", { sku: piece.variants[0].sku, onHand: 0, reason: "storefront catalog e2e: sell out" });
    await card.getByRole("button", { name: `Quick add ${piece.name}` }).click();
    await expect(page.getByText(`${piece.name} is sold out`)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Cart, \d+ items?$/ })).toHaveCount(0);
  });
});
