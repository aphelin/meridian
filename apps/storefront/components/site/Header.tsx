"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCatalog } from "@/lib/catalog-context";
import { CART_ADDED, cartCount, openPanel, useCart, useSaved } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { Icon } from "../ui/Icon";
import { Wordmark } from "../ui/Wordmark";
import { AccountMenu } from "./AccountMenu";

function Tip({ label, children }: { label: React.ReactNode; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Header() {
  const path = usePathname();
  const { categories } = useCatalog();
  const nav = [{ href: "/shop", label: "Shop all" }, ...[...categories].sort((a, b) => a.position - b.position).map((c) => ({ href: `/shop/${c.id}`, label: c.label }))];
  const count = cartCount(useCart());
  const saved = useSaved().length;
  const me = trpc.auth.me.useQuery();
  const [scrolled, setScrolled] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    const onAdded = () => setBump((b) => b + 1);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener(CART_ADDED, onAdded);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener(CART_ADDED, onAdded);
    };
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-paper transition-[border-color,box-shadow] duration-300 ${
        scrolled ? "border-line shadow-[0_10px_30px_-24px_rgb(27_26_23/0.35)]" : "border-transparent"
      }`}
    >
      <div className="shell flex h-16 items-center gap-2 lg:h-[72px]">
        <button type="button" className="icon-btn -ml-2.5 lg:hidden" aria-label="Open menu" onClick={() => openPanel("menu")}>
          <Icon name="menu" />
        </button>
        <Link href="/" className="rounded-md text-ink" aria-label="Meridian, home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="ml-12 hidden items-center gap-8 lg:flex">
          {nav.map((item) => {
            const on = item.href === "/shop" ? path === "/shop" : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={`relative py-2 text-[0.9375rem] transition-colors after:absolute after:inset-x-0 after:bottom-0.5 after:h-px after:origin-left after:bg-ink after:transition-transform after:duration-300 ${
                  on ? "text-ink after:scale-x-100" : "text-stone after:scale-x-0 hover:text-ink hover:after:scale-x-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center">
          <Tip
            label={
              <>
                Search <kbd className="kbd !h-5 !min-w-5 !bg-paper/15 !text-paper !shadow-none">/</kbd>
              </>
            }
          >
            <button type="button" className="icon-btn" aria-label="Search" aria-keyshortcuts="/ Control+K Meta+K" onClick={() => openPanel("search")}>
              <Icon name="search" />
            </button>
          </Tip>
          {me.data ? (
            <AccountMenu user={me.data} className="hidden sm:inline-grid" />
          ) : (
            <Tip label="Account">
              <Link href="/account" className="icon-btn hidden sm:inline-grid" aria-label="Account">
                <Icon name="user" />
              </Link>
            </Tip>
          )}
          <Tip label="Saved items">
            <Link href="/saved" className="icon-btn hidden sm:inline-grid" aria-label={saved ? `Saved items, ${saved}` : "Saved items"}>
              <Icon name="heart" />
              {saved ? <span className="count-badge">{saved}</span> : null}
            </Link>
          </Tip>
          <Tip label="Cart">
            <button
              type="button"
              className="icon-btn -mr-2.5"
              aria-label={count ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart"}
              onClick={() => openPanel("cart")}
            >
              <Icon name="bag" />
              {count ? (
                <span key={bump} className={`count-badge ${bump ? "bump" : ""}`}>
                  {count}
                </span>
              ) : null}
            </button>
          </Tip>
        </div>
      </div>
    </header>
  );
}
