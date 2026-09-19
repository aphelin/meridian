import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AddSetButton } from "@/components/home/AddSetButton";
import { Spotlight } from "@/components/home/Spotlight";
import { ProductCard, ProductGrid } from "@/components/product/ProductCard";
import { RecentlyViewed } from "@/components/product/RecentlyViewed";
import { Icon } from "@/components/ui/Icon";
import { Plate } from "@/components/ui/Plate";
import { money } from "@/lib/format";
import { heroImages } from "@/lib/hero";
import { variantImage } from "@/lib/product";
import { absoluteUrl, jsonLdHtml, pageMetadata } from "@/components/shop/seo";
import { cachedCatalog, renderPerRequestIfBuilding } from "@/server/render-cache";

const description = "Sofas, tables, lighting and storage in wool, oak and walnut. A demo furniture store with a real, sandboxed checkout.";
const home = pageMetadata({ title: "Meridian", description, path: "/", image: "/hero/room-01.jpg" });

// ISR: prerendered and refreshed at most every 60 s, or on demand after admin catalog writes.
export const revalidate = 60;

export const metadata: Metadata = {
  ...home,
  title: { absolute: "Meridian: furniture for everyday rooms" },
  openGraph: { ...home.openGraph, title: "Meridian: furniture for everyday rooms" },
  twitter: { ...home.twitter, title: "Meridian: furniture for everyday rooms" },
};

function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": absoluteUrl("/#organization"), name: "Meridian", url: absoluteUrl("/"), logo: absoluteUrl("/icon.svg") },
      {
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        name: "Meridian",
        url: absoluteUrl("/"),
        publisher: { "@id": absoluteUrl("/#organization") },
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/search")}?q={search_term_string}` }, "query-input": "required name=search_term_string" },
      },
    ],
  };
}

const dinnerSet = [
  { slug: "dune-table", variantId: "bleach", qty: 1 },
  { slug: "reed-chair", variantId: "olive", qty: 4 },
  { slug: "pendant-coil", variantId: "brass", qty: 1 },
];
const materialRow = ["oak", "walnut", "wool", "leather", "cane", "stone", "paper-cord", "stoneware", "terrazzo", "cork"];

export default async function HomePage() {
  const catalog = await cachedCatalog().catch(async (error: unknown) => {
    await renderPerRequestIfBuilding();
    throw error;
  });
  const list = catalog.products;
  const categories = [...catalog.categories].sort((a, b) => a.position - b.position);
  const hero = heroImages();
  const heroCover: Record<string, string> = { seating: hero.seating, tables: hero.tables, lighting: hero.lighting, storage: hero.storage };
  const holt = list.find((p) => p.slug === "holt-sofa") ?? list[0];
  // Pieces in the hero photo (hero/room-01.jpg), with their spot in the photo in percent. Phones show fewer tags.
  // `phone`: shown below sm. `narrow`: also shown on the smallest phones (under 400px), where two tags would collide. `underText`: the piece sits under the heading when the copy overlays the photo (md to xl),
  // so its tag hides there.
  const heroSpots = [
    { slug: "holt-sofa", x: 74, y: 56, side: "left", phone: true, underText: false, croppedMdToLg: false, narrow: true },
    { slug: "pico-stool", x: 38.5, y: 69, side: "right", phone: true, underText: true, croppedMdToLg: false, narrow: false },
    { slug: "ash-table", x: 60, y: 78, side: "right", phone: false, underText: false, croppedMdToLg: false, narrow: true },
    // From md to lg the tall hero crops the lamp out of frame.
    { slug: "kite-lamp", x: 89, y: 27, side: "left", phone: false, underText: false, croppedMdToLg: true, narrow: true },
  ] as const;
  const heroTags = heroSpots.flatMap((spot) => {
    const piece = list.find((p) => p.slug === spot.slug);
    return piece ? [{ ...spot, piece }] : [];
  });
  const featured = list.filter((p) => p.featured && p.slug !== holt?.slug).slice(0, 8);
  const look = dinnerSet.flatMap((line) => {
    const piece = list.find((p) => p.slug === line.slug);
    const variant = piece?.variants.find((v) => v.id === line.variantId);
    return piece && variant ? [{ ...line, sku: variant.sku, piece }] : [];
  });
  const lookTotal = look.reduce((n, l) => n + l.piece.priceCents * l.qty, 0);

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(siteJsonLd())} />
      <section className="shell pt-2 sm:pt-3" aria-labelledby="hero-title">
        <div className="relative">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] bg-plaster [container-type:size] sm:aspect-[16/10] md:aspect-auto md:h-[min(calc(100svh-8rem),880px)] md:min-h-[580px]">
          <div className="hero-settle absolute inset-0">
            <Image
              src={hero.desktop}
              alt="A living room: the Holt sofa in oatmeal wool, a terracotta Pico stool, a pale Ash coffee table and a Kite floor lamp"
              fill
              priority
              quality={90}
              sizes="96vw"
              className="object-cover object-[62%_62%] md:object-[64%_60%]"
            />
          </div>
          <div className="hero-wash" aria-hidden="true" />
          {/* Price tags ride on a box with the photo's own 16:9 shape, cropped exactly like the image (same cover sizing and
              object-position), so each tag stays on its piece at every width. x/y are percentages of the photo. */}
          <div className="absolute left-[62%] top-[62%] aspect-[16/9] w-[max(100cqw,calc(100cqh*16/9))] -translate-x-[62%] -translate-y-[62%] md:left-[64%] md:top-[60%] md:-translate-x-[64%] md:-translate-y-[60%]">
            {heroTags.map(({ piece, x, y, side, phone, underText, croppedMdToLg, narrow }) => (
              <Link
                key={piece.slug}
                href={`/product/${piece.slug}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                className={`group absolute -translate-y-1/2 items-center gap-2 md:gap-2.5 ${side === "left" ? "flex -translate-x-[calc(100%-0.875rem)] flex-row-reverse" : "flex -translate-x-3.5"} ${phone ? "" : "max-sm:hidden"} ${underText ? "md:max-xl:hidden" : ""} ${croppedMdToLg ? "md:max-lg:hidden" : ""} ${narrow ? "" : "max-[400px]:hidden"}`}
                aria-label={`${piece.name} ${piece.kind.toLowerCase()}, ${money(piece.priceCents)}`}
              >
                <span className="relative grid size-7 place-items-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-paper/60 [animation-duration:2.4s]" />
                  <span className="relative size-3 rounded-full bg-paper shadow-[0_0_0_4px_rgb(255_255_255/0.35)]" />
                </span>
                <span className="whitespace-nowrap rounded-full bg-paper px-3 py-1.5 text-[0.8125rem] shadow-[var(--shadow-pop)] transition-transform duration-300 group-hover:-translate-y-0.5 md:px-3.5 md:py-2 md:text-sm">
                  <span className="font-medium">{piece.name}</span> <span className="tabular text-stone">{money(piece.priceCents)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
          <div className="hero-copy hero-rise pt-7">
            <h1 id="hero-title" className="hero-title display text-ink">
              Furniture for <span className="hero-accent">everyday rooms</span>
            </h1>
            <p className="hero-lede mt-4 max-w-[34ch] text-[1.0625rem] leading-relaxed text-stone">
              Sofas, tables and lamps in wool, oak and walnut. It’s a demo shop, so checkout runs in a sandbox and no card is charged.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/shop" className="btn btn-primary">
                Shop all furniture
              </Link>
              <Link href="/product/holt-sofa" className="btn btn-secondary md:bg-paper/85 md:shadow-none md:hover:bg-paper">
                See the Holt sofa
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="shell mt-20 md:mt-28" aria-labelledby="categories-title">
        <div className="mb-8 flex items-end justify-between gap-6">
          <h2 id="categories-title" className="section-title">
            Shop by category
          </h2>
          <Link href="/shop" className="link hidden text-[0.9375rem] sm:inline">
            View all pieces
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-x-3.5 gap-y-8 sm:gap-x-5 lg:grid-cols-4 xl:gap-x-6">
          {categories.map((c) => {
            const count = list.filter((p) => p.categoryId === c.id).length;
            return (
              <li key={c.id}>
                <Link href={`/shop/${c.id}`} className="zoom-on-hover group block">
                  <div className="well aspect-[4/5]">
                    <div className="plate-stage">
                      <Plate src={heroCover[c.id] ?? c.coverImageUrl} alt="" sizes="(min-width: 1024px) 23vw, 46vw" />
                    </div>
                  </div>
                  <div className="mt-3.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-medium tracking-[-0.015em]">{c.label}</p>
                      <p className="text-sm text-stone">{count} pieces</p>
                    </div>
                    <span className="grid size-10 place-items-center rounded-full bg-plaster transition-colors duration-300 group-hover:bg-ink group-hover:text-paper">
                      <Icon name="arrowRight" size={18} />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="shell mt-24 md:mt-32" aria-labelledby="featured-title">
        <div className="mb-8 flex items-end justify-between gap-6">
          <h2 id="featured-title" className="section-title">
            Featured pieces
          </h2>
          <Link href="/shop" className="link text-[0.9375rem]">
            Shop all
          </Link>
        </div>
        {featured.length ? (
          <ProductGrid>
            {featured.map((piece) => (
              <ProductCard key={piece.slug} piece={piece} />
            ))}
          </ProductGrid>
        ) : (
          <div className="panel px-6 py-14 text-center">
            <p className="heading">No featured pieces right now</p>
            <p className="mx-auto mt-2 max-w-[44ch] text-stone">The whole collection is still in the shop.</p>
            <Link href="/shop" className="btn btn-primary mt-6">
              Browse the shop
            </Link>
          </div>
        )}
      </section>

      {holt ? (
        <Spotlight
          piece={holt}
          copy="Oatmeal suits a light room and charcoal suits a darker one. Both colours have turned walnut legs and wool covers you can take off for cleaning."
        />
      ) : null}

      <section className="shell mt-24 md:mt-32" aria-labelledby="look-title">
        <div className="grid gap-8 overflow-hidden rounded-[22px] bg-plaster lg:grid-cols-12 lg:gap-0">
          <div className="relative aspect-[4/3] lg:col-span-7 lg:aspect-auto lg:min-h-[440px]">
            <Plate src={hero.dining} alt="Dune round dining table in bleached oak" sizes="(min-width: 768px) 56vw, 96vw" ratio={4 / 3} />
          </div>
          <div className="flex min-w-0 flex-col px-6 pb-8 sm:px-10 lg:col-span-5 lg:justify-center lg:py-12">
            <h2 id="look-title" className="section-title">
              Dinner for four
            </h2>
            <p className="mt-3 max-w-[40ch] text-stone">
              A round table in bleached oak, four dining chairs in olive leather and a blackened brass pendant to hang above it.
            </p>
            <ul className="mt-7 divide-y divide-line-strong/60 border-y border-line-strong/60">
              {look.map(({ piece, variantId, qty }) => (
                <li key={piece.slug}>
                  <Link href={`/product/${piece.slug}?finish=${variantId}`} className="group flex items-center gap-4 py-3.5">
                    <div className="well aspect-square w-14 shrink-0 !rounded-[12px] bg-paper">
                      <Plate src={variantImage(piece, variantId)} alt="" sizes="56px" ratio={1} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium group-hover:underline">
                        {qty > 1 ? `${qty} × ` : ""}
                        {piece.name}
                      </p>
                      <p className="text-sm text-stone">
                        {piece.kind}
                        {qty > 1 ? `, ${money(piece.priceCents)} each` : ""}
                      </p>
                    </div>
                    <p className="tabular">{money(piece.priceCents * qty)}</p>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex justify-between">
              <span className="text-stone">The set</span>
              <span className="font-medium tabular">{money(lookTotal)}</span>
            </p>
            {look.length ? <AddSetButton lines={look.map(({ sku, slug, variantId, qty }) => ({ sku, slug, variantId, qty }))} label="Add the set to cart" /> : null}
          </div>
        </div>
      </section>

      <section className="shell mt-24 md:mt-32" aria-labelledby="materials-title">
        <h2 id="materials-title" className="section-title">
          Shop by material
        </h2>
        <p className="mt-2 max-w-[52ch] text-stone">Pick a material to see every piece made with it.</p>
        <ul className="no-scrollbar -mx-4 mt-8 flex snap-x scroll-px-4 gap-5 overflow-x-auto lg:gap-3 xl:gap-5 px-4 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0 lg:justify-between">
          {materialRow.map((id) => {
            const m = catalog.materials.find((x) => x.id === id);
            if (!m) return null;
            return (
              <li key={id} className="snap-start">
                <Link href={`/shop?material=${id}`} className="group flex w-[88px] flex-col items-center gap-3 lg:w-20 xl:w-[88px]">
                  <span className="swatch material-swatch block size-[88px] lg:size-20 xl:size-[88px]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 256px texture crop, served as-is like every other swatch */}
                    <img src={m.swatchUrl} alt="" width={88} height={88} loading="lazy" />
                  </span>
                  <span className="text-[0.9375rem] group-hover:underline">{m.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="how-it-works" className="shell mt-24 scroll-mt-28 md:mt-32" aria-labelledby="how-title">
        <div className="grid gap-10 border-t border-line pt-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 id="how-title" className="section-title">
              How this store works
            </h2>
            <p className="mt-3 max-w-[38ch] text-stone">
              Meridian is a portfolio project: a small furniture shop on top of a real commerce backend.
            </p>
            <Link href="/admin" className="btn btn-secondary mt-7">
              Open the admin dashboard
            </Link>
          </div>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-8">
            {[
              [
                "A checkout that can fail safely",
                "Placing an order runs a saga: it reserves stock, applies your coupon and requests payment, and releases the stock if any step fails.",
              ],
              ["Payments without real money", "Checkout runs on Stripe in test mode, so you pay with a test card and no real money moves. Nothing ships."],
              [
                "Accounts with rotating sessions",
                "Short-lived access tokens and single-use refresh tokens live in httpOnly cookies, so a stolen refresh token is caught on reuse.",
              ],
              [
                "One app in front of the services",
                "Your browser only talks to this Next.js app, which calls separate identity, catalog, inventory, checkout, payment, notification, search and analytics services.",
              ],
            ].map(([title, body]) => (
              <div key={title}>
                <dt className="font-medium">{title}</dt>
                <dd className="mt-1.5 text-stone">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <RecentlyViewed />
    </main>
  );
}
