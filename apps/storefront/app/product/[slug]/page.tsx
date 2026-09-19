import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard, ProductGrid } from "@/components/product/ProductCard";
import { ProductView } from "@/components/product/ProductView";
import { RecentlyViewed, TrackView } from "@/components/product/RecentlyViewed";
import { Reviews } from "@/components/product/Reviews";
import { absoluteUrl, jsonLdHtml, pageMetadata } from "@/components/shop/seo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { hasPublicFile } from "@/lib/plates";
import { categoryOf, galleryImages, materialLabels } from "@/lib/product";
import type { CatalogSnapshotDto, ProductDto } from "@meridian/contracts";
import { getCatalog } from "@/server/catalog";
import { cachedCatalog, renderPerRequestIfBuilding } from "@/server/render-cache";

type Props = { params: Promise<{ slug: string }> };

// ISR: the page shell (catalog content, JSON-LD, related pieces) is prerendered and refreshed at most every 60 s or on
// demand after admin writes. Live stock is not part of it: ProductView fetches `catalog.stock` in the browser, and
// `?finish=` is applied after hydration, so one cached page serves every finish.
export const revalidate = 60;

/** Every published product at build time; products published later (or all of them, when catalog is down) render on first request. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const catalog = await getCatalog().catch(() => null);
  return (catalog?.products ?? []).filter((p) => p.status === "published").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const piece = (await cachedCatalog().catch(() => null))?.products.find((p) => p.slug === slug);
  if (!piece) return { title: "Not found", robots: { index: false } };
  return pageMetadata({ title: `${piece.name} ${piece.kind.toLowerCase()}`, description: piece.story, path: `/product/${piece.slug}`, image: piece.heroImageUrl, type: "website" });
}

/**
 * schema.org Product with one Offer per finish and the rating when reviews exist. The page is cached, so availability
 * follows the catalog sold-out flag (revalidated on demand when an admin changes it), not per-SKU inventory counts,
 * which change with every order and are shown live in the page instead.
 */
function productJsonLd(piece: ProductDto, catalog: CatalogSnapshotDto) {
  const url = absoluteUrl(`/product/${piece.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${piece.name} ${piece.kind.toLowerCase()}`,
    description: piece.story,
    url,
    sku: piece.variants[0]?.sku,
    image: [...new Set([piece.heroImageUrl, ...piece.variants.map((v) => v.imageUrl)])].filter(Boolean).map(absoluteUrl),
    brand: { "@type": "Brand", name: "Meridian" },
    category: catalog.categories.find((c) => c.id === piece.categoryId)?.label,
    material: materialLabels(piece, catalog.materials).join(", ") || undefined,
    offers: piece.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      name: v.label,
      url: `${url}?finish=${encodeURIComponent(v.id)}`,
      price: (piece.priceCents / 100).toFixed(2),
      priceCurrency: piece.currency,
      availability: piece.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    })),
    ...(piece.rating.count > 0 && piece.rating.average !== null
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(piece.rating.average.toFixed(2)), reviewCount: piece.rating.count, bestRating: 5, worstRating: 1 } }
      : {}),
  };
}

export default async function ProductPage({ params }: Props) {
  const [{ slug }, catalog] = await Promise.all([
    params,
    cachedCatalog().catch(async (error: unknown) => {
      await renderPerRequestIfBuilding();
      throw error;
    }),
  ]);
  // Admin writes expire the snapshot tag immediately (`expire: 0`), so a product published a moment ago is already here.
  const snapshot = catalog;
  const piece = snapshot.products.find((p) => p.slug === slug);
  if (!piece) notFound();
  const details = piece.details;
  const related = snapshot.products.filter((p) => p.categoryId === piece.categoryId && p.slug !== piece.slug).slice(0, 4);
  const category = categoryOf(snapshot, piece.categoryId);
  const extra = [piece.detailImageUrl].filter((src): src is string => Boolean(src && (!src.startsWith("/") || hasPublicFile(src))));
  const dimensions = [
    ["Width", details.widthCm, "cm"],
    ["Depth", details.depthCm, "cm"],
    ["Height", details.heightCm, "cm"],
    ["Weight", details.weightKg, "kg"],
  ].filter((row): row is [string, number, string] => typeof row[1] === "number");

  return (
    <main className="shell pt-4 md:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(productJsonLd(piece, snapshot))} />
      <TrackView slug={piece.slug} />
      <ProductView piece={piece} category={category} images={galleryImages(piece, extra)}>
        <Accordion type="multiple" defaultValue={["materials"]}>
          <AccordionItem value="materials">
            <AccordionTrigger>Materials & construction</AccordionTrigger>
            <AccordionContent>
              {details.construction ? <p>{details.construction}</p> : null}
              <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-y-2 text-[0.9375rem]">
                <dt>Materials</dt>
                <dd className="text-ink">{materialLabels(piece, catalog.materials).join(", ")}</dd>
                <dt>Finishes</dt>
                <dd className="text-ink">{piece.variants.map((v) => v.label).join(", ")}</dd>
              </dl>
            </AccordionContent>
          </AccordionItem>
          {dimensions.length ? (
            <AccordionItem value="dimensions">
              <AccordionTrigger>Dimensions</AccordionTrigger>
              <AccordionContent>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {dimensions.map(([label, value, unit]) => (
                    <div key={label} className="rounded-[12px] bg-plaster px-3.5 py-3">
                      <dt className="text-xs">{label}</dt>
                      <dd className="mt-0.5 font-medium text-ink tabular">
                        {value} {unit}
                      </dd>
                    </div>
                  ))}
                </dl>
              </AccordionContent>
            </AccordionItem>
          ) : null}
          {details.care ? (
            <AccordionItem value="care">
              <AccordionTrigger>Care</AccordionTrigger>
              <AccordionContent>
                <p>{details.care}</p>
              </AccordionContent>
            </AccordionItem>
          ) : null}
          <AccordionItem value="delivery">
            <AccordionTrigger>Delivery & returns</AccordionTrigger>
            <AccordionContent>
              <p>
                This is a demo store. Orders go through a real checkout and a sandbox payment, but nothing is made or shipped. You
                can request a return from a delivered order within 30 days to see how returns are handled.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ProductView>

      <Reviews slug={piece.slug} name={piece.name} />

      {related.length ? (
        <section className="mt-24 md:mt-32" aria-labelledby="related-title">
          <h2 id="related-title" className="section-title mb-8">
            More {category?.label.toLowerCase()}
          </h2>
          <ProductGrid>
            {related.map((p) => (
              <ProductCard key={p.slug} piece={p} />
            ))}
          </ProductGrid>
        </section>
      ) : null}
      <RecentlyViewed except={piece.slug} inset={false} />
    </main>
  );
}
