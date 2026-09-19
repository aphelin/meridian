import type { APIRequestContext } from "@playwright/test";
import { eventually, expect, mutate, test } from "./support";

/** Server HTML only (no JavaScript runs): what crawlers and first paint get. */
async function html(api: APIRequestContext, path: string) {
  const res = await api.get(path);
  return { status: res.status(), body: await res.text() };
}

/** Names of the product cards rendered as markup (not just mentioned in the RSC payload). */
const cardNames = (body: string) => [...body.matchAll(/<article[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

test.describe("server-rendered catalog pages", () => {
  test("shop, category, filtered shop and search pages render their first results page into the HTML", async ({ request }) => {
    const shop = await html(request, "/shop");
    expect(shop.status).toBe(200);
    expect(cardNames(shop.body).length, "a full first page of cards").toBe(16);
    expect(shop.body).toMatch(/Showing (<!-- -->)?16(<!-- -->)? of/);
    expect(shop.body).toContain("Load more");

    const seating = await html(request, "/shop/seating");
    expect(seating.status).toBe(200);
    expect(cardNames(seating.body)).toContain("Holt");
    expect(cardNames(seating.body)).not.toContain("Dune");

    // filtered variants render per request with the filter applied
    const lighting = await html(request, "/shop?material=brass&sort=name");
    expect(lighting.status).toBe(200);
    const names = cardNames(lighting.body);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    const search = await html(request, "/search?q=holt");
    expect(search.status).toBe(200);
    expect(cardNames(search.body)).toContain("Holt");

    expect((await html(request, "/shop/no-such-category")).status).toBe(404);
  });

  test("product page HTML carries the catalog content and JSON-LD but no live stock", async ({ request }) => {
    const { status, body } = await html(request, "/product/holt-sofa?finish=charcoal");
    expect(status).toBe(200);
    expect(body).toMatch(/<h1[^>]*>Holt<\/h1>/);
    expect(body).toContain('"@type":"Product"');
    // stock pills are filled in by the browser from catalog.stock
    expect(body).not.toMatch(/Only \d+ left|status-ok|status-warn/);
  });

  test("admin writes revalidate the cached listing and product pages", async ({ request, admin, fresh }) => {
    test.setTimeout(150_000);
    // warm the cached pages first so the assertions below need on-demand revalidation (under `next start`)
    await html(request, "/shop/seating");
    const piece = await fresh(admin, { variants: [{ label: "Natural oak", material: "oak", onHand: 2 }] });

    const product = await html(request, `/product/${piece.slug}`);
    expect(product.status).toBe(200);
    expect(product.body).toContain(`>${piece.name}</h1>`);
    await eventually(async () => cardNames((await html(request, "/shop/seating")).body).includes(piece.name), `${piece.slug} in the /shop/seating HTML`, 30_000);

    await mutate(admin, "admin.products.archive", { id: piece.id });
    // Revalidation marks the cached page stale; Next may still answer the very next request from the old render while
    // it refreshes behind it, so the archived page is gone within a couple of requests rather than on the first one.
    await expect.poll(async () => (await html(request, `/product/${piece.slug}`)).status, { timeout: 15_000, intervals: [500, 1000] }).toBe(404);
  });
});
