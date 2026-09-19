"use client";

import { useEffect } from "react";
import type { ProductDto } from "@meridian/contracts";
import { useCatalog } from "@/lib/catalog-context";
import { productBySlug } from "@/lib/product";
import { touchRecent, useRecent } from "@/lib/stores";
import { ProductCard, ProductGrid } from "./ProductCard";

export function RecentlyViewed({ except, inset = true }: { except?: string; inset?: boolean }) {
  const catalog = useCatalog();
  const rows = useRecent()
    .filter((slug) => slug !== except)
    .map((slug) => productBySlug(catalog, slug))
    .filter((p): p is ProductDto => Boolean(p))
    .slice(0, 4);

  if (!rows.length) return null;

  return (
    <section className={`${inset ? "shell " : ""}mt-24`} aria-labelledby="recent-title">
      <h2 id="recent-title" className="section-title mb-8">
        Recently viewed
      </h2>
      {rows.length < 3 ? (
        // One or two pieces keep a card's width instead of stretching across the four-column grid.
        <div className="flex gap-x-3.5 sm:gap-x-5 xl:gap-x-6">
          {rows.map((piece) => (
            <div key={piece.slug} className="w-[calc(50%-0.4375rem)] sm:w-[calc(50%-0.625rem)] lg:w-[calc(25%-1.125rem)]">
              <ProductCard piece={piece} />
            </div>
          ))}
        </div>
      ) : (
        <ProductGrid>
          {rows.map((piece) => (
            <ProductCard key={piece.slug} piece={piece} />
          ))}
        </ProductGrid>
      )}
    </section>
  );
}

export function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    touchRecent(slug);
  }, [slug]);
  return null;
}
