"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Command, CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useCatalog } from "@/lib/catalog-context";
import { productsIn } from "@/lib/product";
import { trpc } from "@/lib/trpc";
import { money } from "@/lib/format";
import { closePanel, openPanel, usePanel } from "@/lib/stores";
import { referenceOf } from "../shop/states";
import { Icon } from "../ui/Icon";
import { Plate } from "../ui/Plate";

const popular = ["oak", "wool sofa", "lamp", "leather", "walnut", "velvet"];

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName)));
}

/** Instant search over the collection: Ctrl/⌘ K or "/" from anywhere, results as you type, Enter to open. */
export function SearchCommand() {
  const router = useRouter();
  const open = usePanel() === "search";
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const catalog = useCatalog();
  const categories = [...catalog.categories].sort((a, b) => a.position - b.position);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 150);
    return () => window.clearTimeout(t);
  }, [q]);
  const suggest = trpc.search.suggest.useQuery({ q: debounced, limit: 6 }, { enabled: open && debounced.length > 0, placeholderData: (previous) => previous });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open) closePanel();
        else openPanel("search");
      } else if (e.key === "/" && !open && !isTyping(e.target)) {
        e.preventDefault();
        openPanel("search");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (href: string) => {
    closePanel();
    setQ("");
    router.push(href);
  };

  const needle = q.trim();
  const lower = needle.toLowerCase();
  const hits = needle ? (suggest.data ?? []) : [];
  const soldOut = new Set(catalog.products.filter((p) => p.soldOut).map((p) => p.slug));
  const materialHits = needle ? catalog.materials.filter((m) => m.label.toLowerCase().includes(lower)).slice(0, 3) : [];
  const categoryHits = needle ? categories.filter((c) => c.label.toLowerCase().includes(lower)) : categories;
  const waiting = Boolean(needle) && !hits.length && (debounced !== needle || suggest.isFetching) && !suggest.isError;
  const nothing = needle && !waiting && !suggest.isError && !hits.length && !materialHits.length && !categoryHits.length;

  return (
    <CommandDialog
      title="Search"
      description="Search pieces, materials and categories"
      open={open}
      onOpenChange={(next) => {
        if (!next) closePanel();
      }}
    >
      <Command shouldFilter={false} loop>
        <CommandInput value={q} onValueChange={setQ} placeholder="Search pieces, materials, colours">
          {q ? (
            <button type="button" className="btn btn-quiet btn-sm !min-h-8 !px-3" onClick={() => setQ("")}>
              Clear
            </button>
          ) : (
            <kbd className="kbd hidden sm:inline-grid">Esc</kbd>
          )}
        </CommandInput>
        <CommandList>
          {nothing ? (
            <div className="px-5 py-8 text-center" role="status">
              <p className="heading">Nothing matches “{needle}”</p>
              <p className="mt-1.5 text-sm text-stone">Check the spelling, or try a material like oak, wool or brass.</p>
            </div>
          ) : null}

          {!needle ? (
            <CommandGroup heading="Popular searches">
              <div className="flex flex-wrap gap-2 px-2 pb-2">
                {popular.map((s) => (
                  <CommandItem
                    key={s}
                    value={`popular:${s}`}
                    onSelect={() => setQ(s)}
                    className="!gap-2 !rounded-full !px-3.5 !py-2 text-sm shadow-[inset_0_0_0_1px_var(--color-line)] data-[selected=true]:shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                  >
                    <Icon name="search" size={15} className="text-stone" />
                    {s}
                  </CommandItem>
                ))}
              </div>
            </CommandGroup>
          ) : null}

          {waiting ? (
            <CommandGroup heading="Pieces">
              <div className="grid gap-1 px-1 pb-1" aria-busy="true" aria-label="Loading suggestions">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="skeleton aspect-[4/5] w-11 shrink-0 !rounded-[10px]" />
                    <span className="flex-1">
                      <span className="skeleton block h-4 w-1/3" />
                      <span className="skeleton mt-1.5 block h-3.5 w-1/2" />
                    </span>
                  </div>
                ))}
              </div>
            </CommandGroup>
          ) : null}

          {needle && suggest.isError ? (
            <div className="alert alert-error mx-3 my-2" role="alert">
              <span>
                Suggestions are unavailable right now. Press Enter to search anyway.
                {referenceOf(suggest.error) ? <span className="mt-1 block text-xs tabular break-all">{referenceOf(suggest.error)}</span> : null}
              </span>
            </div>
          ) : null}

          {hits.length && !waiting ? (
            <CommandGroup heading="Pieces">
              {hits.map((piece) => (
                <CommandItem key={piece.slug} value={`piece:${piece.slug}`} onSelect={() => go(`/product/${piece.slug}`)}>
                  <span className="well aspect-[4/5] w-11 shrink-0 !rounded-[10px]">
                    <Plate src={piece.heroImageUrl} alt="" sizes="44px" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{piece.name}</span>
                    <span className="block truncate text-sm text-stone">{piece.kind}</span>
                  </span>
                  <span className={`text-sm tabular ${soldOut.has(piece.slug) ? "text-stone" : ""}`}>{soldOut.has(piece.slug) ? "Sold out" : money(piece.priceCents)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {materialHits.length ? (
            <CommandGroup heading="Materials">
              {materialHits.map((m) => (
                <CommandItem key={m.id} value={`material:${m.id}`} onSelect={() => go(`/shop?material=${m.id}`)}>
                  <span className="swatch block size-9 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- material texture swatch */}
                    <img src={m.swatchUrl} alt="" loading="lazy" />
                  </span>
                  <span className="flex-1">Everything in {m.label.toLowerCase()}</span>
                  <Icon name="arrowRight" size={16} className="text-stone" />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {categoryHits.length ? (
            <CommandGroup heading={needle ? "Categories" : "Browse"}>
              {categoryHits.map((c) => (
                <CommandItem key={c.id} value={`category:${c.id}`} onSelect={() => go(`/shop/${c.id}`)}>
                  <span className="well aspect-square w-11 shrink-0 !rounded-[10px]">
                    <Plate src={c.coverImageUrl} alt="" sizes="44px" ratio={1} />
                  </span>
                  <span className="flex-1">
                    <span className="block font-medium">{c.label}</span>
                    <span className="block text-sm text-stone">{productsIn(catalog, c.id).length} pieces</span>
                  </span>
                  <Icon name="arrowRight" size={16} className="text-stone" />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {needle ? (
            <CommandGroup>
              <CommandItem value="all-results" onSelect={() => go(`/search?q=${encodeURIComponent(needle)}`)} className="text-stone data-[selected=true]:text-ink">
                <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-plaster">
                  <Icon name="search" size={18} />
                </span>
                <span className="flex-1">See all results for “{needle}”</span>
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
        <div className="hidden items-center gap-5 border-t border-line px-5 py-3 text-[0.8125rem] text-stone sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd>
            to move
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="kbd">↵</kbd>
            to open
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <kbd className="kbd">/</kbd>
            opens search anywhere
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
