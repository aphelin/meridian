import { expect, test } from "./support";

test.describe("SEO", () => {
  test("sitemap lists home, shop, categories, published products and content pages; robots disallows private areas", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    for (const path of ["/", "/shop", "/shop/seating", "/shop/lighting", "/product/holt-sofa", "/terms", "/privacy", "/shipping-returns", "/faq", "/contact"]) {
      expect(locs, `sitemap has ${path}`).toContain(path);
    }
    expect(locs.some((p) => p.startsWith("/account") || p.startsWith("/admin") || p.startsWith("/saved"))).toBe(false);

    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const txt = await robots.text();
    for (const path of ["/account", "/admin", "/checkout", "/orders", "/cart"]) expect(txt).toContain(`Disallow: ${path}`);
    expect(txt).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  test("product page has Product JSON-LD with offers, a canonical URL and OpenGraph tags", async ({ page }) => {
    await page.goto("/product/holt-sofa?finish=charcoal");
    await expect(page.getByRole("heading", { level: 1, name: "Holt" })).toBeVisible();
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
    expect(ld).toMatchObject({ "@context": "https://schema.org", "@type": "Product", name: "Holt three-seat sofa", brand: { name: "Meridian" } });
    expect(ld.offers.length).toBeGreaterThan(0);
    expect(ld.offers[0]).toMatchObject({ "@type": "Offer", priceCurrency: "EUR" });
    expect(ld.offers[0].price).toMatch(/^\d+\.\d{2}$/);
    expect(ld.offers[0].availability).toMatch(/^https:\/\/schema\.org\/(InStock|OutOfStock)$/);

    // canonical drops the finish parameter
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute("href")) ?? "").pathname).toBe("/product/holt-sofa");
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute("href")) ?? "").search).toBe("");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Holt three-seat sofa · Meridian");
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /\/products\/holt-sofa-hero\.jpg$/);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test("shop, category, search and home pages have canonical URLs; saved is noindex", async ({ page }) => {
    const canonical = async (path: string) => {
      await page.goto(path);
      return new URL((await page.locator('link[rel="canonical"]').getAttribute("href")) ?? "");
    };
    expect((await canonical("/")).pathname).toBe("/");
    expect((await canonical("/shop?colour=brown&sort=newest")).pathname).toBe("/shop");
    expect((await canonical("/shop/tables")).pathname).toBe("/shop/tables");
    const search = await canonical("/search?q=oak");
    expect(`${search.pathname}${search.search}`).toBe("/search?q=oak");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\/search\?q=oak$/);

    await page.goto("/saved");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
