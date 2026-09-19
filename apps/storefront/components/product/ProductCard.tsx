"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProductDto, SearchHitDto } from "@meridian/contracts";
import { money } from "@/lib/format";
import { variantImage } from "@/lib/product";
import { Plate } from "../ui/Plate";
import { QuickAdd } from "./QuickAdd";
import { SaveButton } from "./SaveButton";

const SIZES = "(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw";

export function ProductCard({
  piece,
  sizes = SIZES,
  priority,
  soldOut: soldOutOverride,
}: {
  piece: ProductDto;
  sizes?: string;
  priority?: boolean;
  /** Live availability from the search read model; defaults to the catalog's sold-out flag. */
  soldOut?: boolean;
}) {
  const first = piece.variants[0]?.id ?? "";
  const [active, setActive] = useState(first);
  const [mounted, setMounted] = useState<string[]>([first]);
  const href = `/product/${piece.slug}`;
  const current = piece.variants.find((v) => v.id === active) ?? piece.variants[0];
  const soldOut = soldOutOverride ?? piece.soldOut;

  const preview = (id: string) => {
    setActive(id);
    setMounted((m) => (m.includes(id) ? m : [...m, id]));
  };

  return (
    <article className="zoom-on-hover group relative" aria-label={piece.name}>
      <div className="well aspect-[4/5]">
        <div className="plate-stage">
          {piece.variants.length ? (
            piece.variants
              .filter((v) => mounted.includes(v.id))
              .map((v) => (
                <Plate
                  key={v.id}
                  src={variantImage(piece, v.id)}
                  alt={`${piece.name} ${piece.kind.toLowerCase()} in ${v.label.toLowerCase()}`}
                  sizes={sizes}
                  priority={priority && v.id === first}
                  hidden={v.id !== active}
                  className="plate"
                />
              ))
          ) : (
            <Plate src={piece.heroImageUrl} alt={`${piece.name} ${piece.kind.toLowerCase()}`} sizes={sizes} priority={priority} className="plate" />
          )}
        </div>
        {soldOut ? <span className="absolute left-3 top-3 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink">Sold out</span> : null}
      </div>
      <div className="absolute right-3 top-3 z-10">
        <SaveButton slug={piece.slug} name={piece.name} />
      </div>
      {!soldOut && piece.variants.length ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex aspect-[4/5] items-end justify-end p-3 [&>*]:pointer-events-auto">
          <QuickAdd piece={piece} shown={current} />
        </div>
      ) : null}
      <CardText href={href} name={piece.name} kind={piece.kind} priceCents={piece.priceCents} soldOut={soldOut} />
      {piece.variants.length > 1 ? (
        <div className="relative z-10 mt-2 flex items-center gap-0.5" role="group" aria-label={`${piece.name} finishes`}>
          {piece.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              className="swatch-ring"
              aria-pressed={v.id === active}
              aria-label={`Show ${piece.name} in ${v.label}`}
              onMouseEnter={() => preview(v.id)}
              onFocus={() => preview(v.id)}
              onClick={() => preview(v.id)}
            >
              <span className="swatch block size-[18px]">
                {/* eslint-disable-next-line @next/next/no-img-element -- 18px swatch texture, no optimisation needed */}
                <img src={v.swatchUrl} alt="" loading="lazy" />
              </span>
            </button>
          ))}
          <span className="ml-1.5 truncate text-[0.8125rem] text-stone">{current?.label}</span>
        </div>
      ) : (
        <p className="mt-2.5 truncate text-[0.8125rem] text-stone">{current?.label ?? " "}</p>
      )}
    </article>
  );
}

function CardText({ href, name, kind, priceCents, soldOut }: { href: string; name: string; kind: string; priceCents: number; soldOut: boolean }) {
  return (
    // Name and price share the first row; the kind gets the full card width below so narrow phone columns don't clip it.
    <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
      <h3 className="min-w-0 text-[0.9375rem] font-medium leading-snug tracking-[-0.01em]">
        <Link
          href={href}
          className="after:absolute after:inset-x-0 after:top-0 after:aspect-[4/5] after:rounded-[18px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-cobalt"
        >
          {name}
        </Link>
      </h3>
      <p className={`text-[0.9375rem] tabular ${soldOut ? "text-stone" : ""}`}>{money(priceCents)}</p>
      <p className="col-span-2 line-clamp-2 text-sm text-stone">{kind}</p>
    </div>
  );
}

/**
 * A search hit whose full product is not in this browser's catalog snapshot yet (published moments ago): same footprint
 * as a ProductCard, built from the read model's fields.
 */
export function HitCard({ hit, sizes = SIZES, priority }: { hit: SearchHitDto; sizes?: string; priority?: boolean }) {
  return (
    <article className="zoom-on-hover group relative" aria-label={hit.name}>
      <div className="well aspect-[4/5]">
        <div className="plate-stage">
          <Plate src={hit.heroImageUrl} alt={`${hit.name} ${hit.kind.toLowerCase()}`} sizes={sizes} priority={priority} className="plate" />
        </div>
        {!hit.inStock ? <span className="absolute left-3 top-3 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink">Sold out</span> : null}
      </div>
      <div className="absolute right-3 top-3 z-10">
        <SaveButton slug={hit.slug} name={hit.name} />
      </div>
      <CardText href={`/product/${hit.slug}`} name={hit.name} kind={hit.kind} priceCents={hit.priceCents} soldOut={!hit.inStock} />
      <p className="mt-2.5 truncate text-[0.8125rem] text-stone">{" "}</p>
    </article>
  );
}

export function ProductGrid({ children, columns = 4 }: { children: React.ReactNode; columns?: 3 | 4 }) {
  return (
    <div className={`grid grid-cols-2 gap-x-3.5 gap-y-10 sm:gap-x-5 md:gap-y-12 xl:gap-x-6 ${columns === 4 ? "lg:grid-cols-4" : "md:grid-cols-3"}`}>{children}</div>
  );
}
