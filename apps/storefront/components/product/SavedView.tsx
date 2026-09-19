"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { ProductDto } from "@meridian/contracts";
import { plural } from "@/lib/format";
import { replaceSaved, useSaved } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { ProductCardSkeleton, QueryError } from "../shop/states";
import { Icon } from "../ui/Icon";
import { ProductCard, ProductGrid } from "./ProductCard";

const CHUNK = 50;

/**
 * Saved items. Signed in, the account wishlist (catalog-service) is the source of truth and replaces the device list;
 * guests keep the list on the device until they sign in, when it is merged into the account.
 */
export function SavedView() {
  const me = trpc.auth.me.useQuery();
  const signedIn = Boolean(me.data);
  const wishlist = trpc.wishlist.get.useQuery(undefined, { enabled: signedIn, refetchOnMount: "always", staleTime: 0 });
  const local = useSaved();

  useEffect(() => {
    if (wishlist.data) replaceSaved(wishlist.data.slugs);
  }, [wishlist.data]);

  const slugs = local;
  const chunks = Array.from({ length: Math.ceil(slugs.length / CHUNK) }, (_, i) => slugs.slice(i * CHUNK, (i + 1) * CHUNK));
  const products = trpc.useQueries((t) => chunks.map((chunk) => t.catalog.bySlugs({ slugs: chunk }, { staleTime: 60_000, placeholderData: (previous) => previous })));
  const productError = products.find((q) => q.isError)?.error;
  const bySlug = new Map(products.flatMap((q) => q.data ?? []).map((p) => [p.slug, p]));
  const rows = slugs.map((slug) => bySlug.get(slug)).filter((p): p is ProductDto => Boolean(p));
  const loading = me.isPending || (signedIn && wishlist.isPending) || products.some((q) => q.isPending);
  const gone = loading ? 0 : slugs.length - rows.length;

  return (
    <main className="shell pt-8 md:pt-14">
      <h1 className="title">Saved items</h1>
      <p className="mt-3 min-h-6 text-stone" aria-live="polite">
        {loading ? "Loading your saved pieces…" : rows.length ? plural(rows.length, "piece") : ""}
        {!loading && rows.length ? (signedIn ? " · saved to your account" : " · kept on this device") : ""}
      </p>
      {!loading && !signedIn && rows.length ? (
        <p className="mt-4 flex gap-2.5 rounded-[14px] bg-plaster px-4 py-3 text-sm text-stone sm:inline-flex">
          <Icon name="info" size={18} className="mt-px shrink-0 text-ink" />
          <span>
            <Link href="/account" className="link text-ink">
              Sign in
            </Link>{" "}
            to keep these on your account and see them on any device.
          </span>
        </p>
      ) : null}

      {wishlist.isError ? (
        <QueryError className="mt-6" title="We couldn’t load the saved items on your account." error={wishlist.error} onRetry={() => void wishlist.refetch()} />
      ) : null}
      {productError ? <QueryError className="mt-6" title="We couldn’t load your saved pieces." error={productError} onRetry={() => products.forEach((q) => void q.refetch())} /> : null}

      {loading ? (
        <div className="mt-8" aria-busy="true">
          <ProductGrid>
            {Array.from({ length: Math.min(Math.max(slugs.length, 4), 8) }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </ProductGrid>
        </div>
      ) : rows.length ? (
        <div className="mt-8">
          <ProductGrid>
            {rows.map((piece) => (
              <ProductCard key={piece.slug} piece={piece} />
            ))}
          </ProductGrid>
          {gone > 0 ? <p className="mt-10 text-sm text-stone">{plural(gone, "saved piece is", "saved pieces are")} no longer in the collection.</p> : null}
        </div>
      ) : productError || wishlist.isError ? null : (
        <div className="panel mx-auto mt-8 grid max-w-2xl place-items-center px-6 py-20 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-paper">
            <Icon name="heart" size={24} />
          </span>
          <p className="heading mt-5">No saved pieces yet</p>
          <p className="mt-2 max-w-[42ch] text-stone">
            Tap the heart on any piece to save it here.{signedIn ? " Your saved pieces show on every device you sign in to." : " They stay here after you close the tab."}
          </p>
          <Link href="/shop" className="btn btn-primary mt-6">
            Browse the shop
          </Link>
        </div>
      )}
    </main>
  );
}
