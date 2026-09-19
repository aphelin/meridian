"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { CartLines, resolveLines, subtotal } from "@/components/cart/CartLines";
import { CartSyncNotice } from "@/components/cart/CartSyncNotice";
import { blockingIssues, useCartStock } from "@/components/cart/stock";
import { ProductCard, ProductGrid } from "@/components/product/ProductCard";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalog } from "@/lib/catalog-context";
import { money, plural } from "@/lib/format";
import { cartCount, useCart } from "@/lib/stores";
import { reconcileCart } from "@/lib/sync";

const noop = () => () => undefined;

export default function CartPage() {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const catalog = useCatalog();
  const lines = resolveLines(useCart(), catalog);
  const count = cartCount(lines);
  const stock = useCartStock(lines.map((l) => l.sku));
  const blocked = blockingIssues(lines, stock);
  const inCart = new Set(lines.map((l) => l.slug));
  const more = catalog.products.filter((p) => !p.soldOut && !inCart.has(p.slug) && p.priceCents < 70_000).slice(0, 4);

  // Opening the cart picks up changes made on another device (the server cart is newer).
  useEffect(() => {
    void reconcileCart();
  }, []);

  return (
    <main className="shell pt-8 md:pt-14">
      <h1 className="title">Your cart</h1>
      {!hydrated ? (
        <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14" aria-busy="true">
          <div className="grid content-start gap-5 lg:col-span-7">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-40 w-full" />
          </div>
          <Skeleton className="h-72 !rounded-[18px] lg:col-span-5" />
        </div>
      ) : lines.length ? (
        <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
          <section className="lg:col-span-7" aria-label="Items">
            <p className="mb-6 text-stone">{plural(count, "item")}</p>
            <div className="border-t border-line pt-6">
              <CartLines lines={lines} size="lg" stock={stock} />
            </div>
          </section>
          <aside className="lg:col-span-5 lg:mt-[3.1rem]" aria-labelledby="cart-summary-title">
            <div className="panel p-6 sm:p-8 lg:sticky lg:top-28">
              <h2 id="cart-summary-title" className="heading">
                Summary
              </h2>
              <dl className="mt-6 grid gap-3 text-[0.9375rem]">
                <div className="flex justify-between">
                  <dt className="text-stone">Subtotal</dt>
                  <dd className="tabular">{money(subtotal(lines))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone">Delivery</dt>
                  <dd className="text-stone">Chosen at checkout</dd>
                </div>
                <div className="flex justify-between border-t border-line-strong/60 pt-4 text-lg font-medium">
                  <dt>Estimated total</dt>
                  <dd className="tabular">{money(subtotal(lines))}</dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-stone">Prices include VAT. The final VAT depends on the delivery country.</p>
              {blocked ? (
                <p className="hint !text-brick" role="alert">
                  {blocked === 1 ? "One piece doesn’t" : `${blocked} pieces don’t`} have enough stock. Adjust the cart to check out.
                </p>
              ) : null}
              {blocked ? (
                <Button className="mt-6 w-full" disabled>
                  Checkout
                </Button>
              ) : (
                <Button asChild className="mt-6 w-full">
                  <Link href="/checkout">
                    Checkout
                    <Icon name="arrowRight" size={18} />
                  </Link>
                </Button>
              )}
              <CartSyncNotice className="mt-4" />
              <p className="mt-4 text-center text-sm text-stone">Have a discount code? Add it at checkout.</p>
            </div>
          </aside>
        </div>
      ) : (
        <div className="panel mt-8 grid place-items-center px-6 py-20 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-paper" aria-hidden="true">
            <Icon name="bag" size={24} />
          </span>
          <p className="heading mt-5">Your cart is empty</p>
          <p className="mt-2 max-w-[40ch] text-stone">Pieces you add to your cart show up here.</p>
          <Button asChild className="mt-6">
            <Link href="/shop">Start shopping</Link>
          </Button>
        </div>
      )}

      {more.length ? (
        <section className="mt-24" aria-labelledby="more-title">
          <h2 id="more-title" className="section-title mb-8">
            {lines.length ? "Smaller pieces to add" : "Smaller pieces to start with"}
          </h2>
          <ProductGrid>
            {more.map((piece) => (
              <ProductCard key={piece.slug} piece={piece} />
            ))}
          </ProductGrid>
        </section>
      ) : null}
    </main>
  );
}
