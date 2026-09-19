import Link from "next/link";
import { ProductCard, ProductGrid } from "@/components/product/ProductCard";
import { cachedCatalog } from "@/server/render-cache";

export default async function NotFound() {
  // The cached read: Next renders this boundary inside cached pages too, where an uncached call aborts their refresh.
  const catalog = await cachedCatalog().catch(() => null);
  const picks = (catalog?.products ?? []).filter((p) => p.featured && !p.soldOut).slice(0, 4);
  return (
    <main className="shell pt-10 md:pt-16">
      <div className="panel mx-auto grid max-w-2xl place-items-center px-6 py-16 text-center md:py-24">
        <h1 className="title">We couldn’t find that page</h1>
        <p className="mt-3 max-w-[44ch] text-stone">The piece may have been renamed, or the link has a typo. Try searching, or start from the shop.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="btn btn-primary">
            Browse the shop
          </Link>
          <Link href="/search" className="btn btn-secondary">
            Search
          </Link>
        </div>
      </div>
      {picks.length ? (
        <section className="mt-20" aria-labelledby="picks-title">
          <h2 id="picks-title" className="section-title mb-8">
            Featured pieces
          </h2>
          <ProductGrid>
            {picks.map((p) => (
              <ProductCard key={p.slug} piece={p} />
            ))}
          </ProductGrid>
        </section>
      ) : null}
    </main>
  );
}
