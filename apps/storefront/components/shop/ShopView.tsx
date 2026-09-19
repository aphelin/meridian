"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { CategoryDto, MaterialDto, SearchSort } from "@meridian/contracts";
import { Listing, useListing, type ListingSeed } from "./Listing";
import { listingQuery, type ListingState } from "./listing";

/** Kept for `lib/shop-params.ts`. */
export type Sort = SearchSort;

/** /shop and /shop/[category]: search read model listing with filters, sort and "Load more"; state mirrored in the URL. */
export function ShopView({
  categories: unsortedCategories,
  materials,
  category,
  initial,
  seed,
}: {
  categories: CategoryDto[];
  materials: MaterialDto[];
  category?: string;
  initial: ListingState;
  /** First results page rendered on the server for `initial` (absent when search was unavailable). */
  seed?: ListingSeed;
}) {
  const path = usePathname();
  const [state, setState] = useState(initial);
  const categories = [...unsortedCategories].sort((a, b) => a.position - b.position);
  const meta = categories.find((c) => c.id === category);
  const first = useListing(state, category, true, seed).data?.pages[0];
  const counts = new Map((first?.facets.categories ?? []).map((c) => [c.id, c.count]));
  const allCount = first ? [...counts.values()].reduce((n, c) => n + c, 0) : null;
  const qs = listingQuery({ ...state, q: "" });

  const change = (next: ListingState) => {
    setState(next);
    const query = listingQuery(next);
    window.history.replaceState(window.history.state, "", query ? `${path}?${query}` : path);
  };

  return (
    <main className="shell pt-8 md:pt-12">
      <nav aria-label="Breadcrumb" className="text-sm text-stone">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="hover:text-ink">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            {meta ? (
              <Link href="/shop" className="hover:text-ink">
                Shop
              </Link>
            ) : (
              <span aria-current="page">Shop</span>
            )}
          </li>
          {meta ? (
            <>
              <li aria-hidden="true">/</li>
              <li aria-current="page">{meta.label}</li>
            </>
          ) : null}
        </ol>
      </nav>

      <div className="mt-5">
        <h1 className="title">{meta?.label ?? "All furniture"}</h1>
        <p className="mt-3 max-w-[58ch] text-stone">{meta?.blurb ?? "Every piece in the collection: seating, tables, lighting and storage in natural materials."}</p>
      </div>

      <nav aria-label="Categories" className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={qs ? `/shop?${qs}` : "/shop"} className="chip shrink-0" aria-current={!category ? "page" : undefined}>
          All
          {allCount !== null ? <span className="tabular opacity-60">{allCount}</span> : null}
        </Link>
        {categories.map((c) => (
          <Link key={c.id} href={qs ? `/shop/${c.id}?${qs}` : `/shop/${c.id}`} className="chip shrink-0" aria-current={category === c.id ? "page" : undefined}>
            {c.label}
            {first ? <span className="tabular opacity-60">{counts.get(c.id) ?? 0}</span> : null}
          </Link>
        ))}
      </nav>

      <Listing state={state} onChange={change} category={category} materials={materials} seed={seed} />
    </main>
  );
}
