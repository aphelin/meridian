"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { productsIn } from "@/lib/product";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cartCount, closePanel, openPanel, useCart, usePanel, useSaved } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { Icon } from "../ui/Icon";
import { Plate } from "../ui/Plate";
import { Wordmark } from "../ui/Wordmark";
import { AccountIdentity, accountPlaces, InitialAvatar, useSignOut } from "./AccountMenu";

export function MobileMenu() {
  const open = usePanel() === "menu";
  const path = usePathname();
  const count = cartCount(useCart());
  const saved = useSaved().length;
  const catalog = useCatalog();
  const categories = [...catalog.categories].sort((a, b) => a.position - b.position);
  const me = trpc.auth.me.useQuery();
  const user = me.data;
  const logout = useSignOut(closePanel);

  useEffect(() => {
    closePanel();
  }, [path]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closePanel();
      }}
    >
      <SheetContent side="left" className="lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Shop categories, search, saved items, cart and your account.</SheetDescription>
          <Wordmark />
          <SheetClose className="icon-btn -mr-1.5" aria-label="Close menu">
            <Icon name="close" />
          </SheetClose>
        </div>
        <nav aria-label="Shop" className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          <Link href="/shop" className="flex items-center justify-between rounded-xl px-1 py-3 text-lg font-medium">
            Shop all
            <Icon name="arrowRight" size={18} />
          </Link>
          <ul className="mt-1 grid gap-1">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/shop/${c.id}`} className="flex items-center gap-4 rounded-xl p-1 transition-colors hover:bg-plaster">
                  <div className="well aspect-square w-14 shrink-0 !rounded-[12px]">
                    <Plate src={c.coverImageUrl} alt="" sizes="56px" ratio={1} />
                  </div>
                  <span className="flex-1">
                    <span className="block font-medium">{c.label}</span>
                    <span className="block text-sm text-stone">{productsIn(catalog, c.id).length} pieces</span>
                  </span>
                  <Icon name="arrowRight" size={18} className="mr-2 text-stone" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-1 border-t border-line pt-4">
            <button type="button" className="flex items-center gap-3 rounded-xl px-1 py-3 text-left transition-colors hover:bg-plaster" onClick={() => openPanel("search")}>
              <Icon name="search" /> Search
            </button>
            <Link href="/saved" className="flex items-center gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-plaster">
              <Icon name="heart" /> Saved {saved ? <span className="text-stone">({saved})</span> : null}
            </Link>
            <button type="button" className="flex items-center gap-3 rounded-xl px-1 py-3 text-left transition-colors hover:bg-plaster" onClick={() => openPanel("cart")}>
              <Icon name="bag" /> Cart {count ? <span className="text-stone">({count})</span> : null}
            </button>
          </div>
          {user ? (
            <section aria-label="Your account" className="mt-4 border-t border-line pt-4">
              <div className="flex items-center gap-3 px-1 py-2">
                <InitialAvatar user={user} className="size-10 text-[0.9375rem]" />
                <div className="min-w-0 flex-1">
                  <AccountIdentity user={user} />
                </div>
              </div>
              <ul className="mt-2 grid gap-1">
                {accountPlaces(user)
                  .filter((place) => place.href !== "/saved")
                  .map((place) => (
                    <li key={place.href}>
                      <Link href={place.href} className="flex items-center gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-plaster [&>svg]:size-[22px]">
                        {place.icon}
                        {place.label}
                      </Link>
                    </li>
                  ))}
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left transition-colors hover:bg-plaster disabled:opacity-60 [&>svg]:size-[22px]"
                    disabled={logout.isPending}
                    onClick={() => logout.mutate()}
                  >
                    <Icon name="logout" />
                    Sign out
                  </button>
                </li>
              </ul>
            </section>
          ) : (
            <div className="mt-4 border-t border-line pt-4">
              <Link href="/account" className="flex items-center gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-plaster">
                <Icon name="user" /> Sign in
              </Link>
            </div>
          )}
          {/* Scrolls with the list so it never covers the last menu rows on short screens. */}
          <p className="mt-4 border-t border-line px-1 pt-4 text-sm text-stone">
            This is a demo store. Checkout runs in a sandbox and nothing ships.
          </p>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
