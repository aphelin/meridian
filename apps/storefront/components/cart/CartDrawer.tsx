"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { money, plural } from "@/lib/format";
import { variantImage } from "@/lib/product";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cartCount, closePanel, useCart, usePanel } from "@/lib/stores";
import { Icon } from "../ui/Icon";
import { Plate } from "../ui/Plate";
import { CartLines, resolveLines, subtotal } from "./CartLines";
import { CartSyncNotice } from "./CartSyncNotice";
import { blockingIssues, useCartStock } from "./stock";

const suggestions = ["kite-lamp", "pico-stool", "halo-lamp"];

export function CartDrawer() {
  const open = usePanel() === "cart";
  const path = usePathname();
  const catalog = useCatalog();
  const lines = resolveLines(useCart(), catalog);
  const stock = useCartStock(open ? lines.map((l) => l.sku) : []);
  const blocked = blockingIssues(lines, stock);

  useEffect(() => {
    closePanel();
  }, [path]);

  const count = cartCount(lines);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closePanel();
      }}
    >
      <SheetContent side="right">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-7">
          <SheetTitle>
            Your cart {count ? <span className="font-sans text-lg text-stone tabular">({count})</span> : null}
          </SheetTitle>
          <SheetDescription className="sr-only">Pieces in your cart, with quantities and the subtotal.</SheetDescription>
          <SheetClose className="icon-btn -mr-2.5" aria-label="Close cart">
            <Icon name="close" />
          </SheetClose>
        </div>

        {lines.length ? (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
              <CartLines lines={lines} onNavigate={closePanel} stock={stock} />
            </div>
            <div className="border-t border-line bg-paper px-5 pb-6 pt-5 sm:px-7">
              <div className="flex items-baseline justify-between">
                <p className="font-medium">Subtotal</p>
                <p className="text-lg font-medium tabular">{money(subtotal(lines))}</p>
              </div>
              <p className="mt-1 text-sm text-stone">
                {plural(count, "item")}. Delivery, VAT and discount codes are worked out at checkout.
              </p>
              {blocked ? (
                <p className="hint !text-brick" role="alert">
                  Adjust the {blocked === 1 ? "piece" : "pieces"} marked above before checking out.
                </p>
              ) : null}
              <CartSyncNotice className="mt-4" />
              <div className="mt-5 grid gap-2.5">
                <Link href="/checkout" className="btn btn-primary w-full" onClick={closePanel}>
                  Checkout
                  <Icon name="arrowRight" size={18} />
                </Link>
                <Link href="/cart" className="btn btn-secondary w-full" onClick={closePanel}>
                  View cart
                </Link>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-10 sm:px-7">
            <div className="grid size-14 place-items-center rounded-full bg-plaster">
              <Icon name="bag" size={24} />
            </div>
            <p className="heading mt-5">Your cart is empty</p>
            <p className="mt-1.5 text-stone">Pieces you add stay here while you keep browsing.</p>
            <Link href="/shop" className="btn btn-primary mt-6" onClick={closePanel}>
              Start shopping
            </Link>
            <p className="mt-12 text-sm font-medium">Smaller pieces to start with</p>
            <ul className="mt-4 grid gap-4">
              {suggestions.map((slug) => {
                const piece = catalog.products.find((p) => p.slug === slug);
                if (!piece) return null;
                return (
                  <li key={slug}>
                    <Link href={`/product/${slug}`} onClick={closePanel} className="group flex items-center gap-4">
                      <div className="well aspect-[4/5] w-16 shrink-0 !rounded-[10px]">
                        <Plate src={variantImage(piece)} alt="" sizes="64px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium group-hover:underline">{piece.name}</p>
                        <p className="text-sm text-stone">{piece.kind}</p>
                      </div>
                      <p className="text-sm tabular">{money(piece.priceCents)}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
