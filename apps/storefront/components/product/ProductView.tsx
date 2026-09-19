"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CategoryDto, ProductDto } from "@meridian/contracts";
import { money, plural } from "@/lib/format";
import { variantImage } from "@/lib/product";
import { addToCart, MAX_QTY, openPanel } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { Icon } from "../ui/Icon";
import { QtyStepper } from "../ui/QtyStepper";
import { Gallery } from "./Gallery";
import { Stars } from "./Reviews";
import { SaveButton } from "./SaveButton";
import { StockAlertForm } from "./StockAlertForm";
import { SwatchPicker } from "./SwatchPicker";

/**
 * Live availability per SKU from `catalog.stock`, fetched in the browser on load, every 30 s and on focus. The product
 * page is cached (ISR), so stock is never part of its HTML.
 */
function useLiveStock(piece: ProductDto) {
  const skus = piece.variants.map((v) => v.sku);
  const query = trpc.catalog.stock.useQuery(
    { skus },
    {
      enabled: skus.length > 0,
      staleTime: 10_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  );
  return useMemo(() => (query.data ? Object.fromEntries(query.data.map((r) => [r.sku, r.available])) : null), [query.data]);
}

const noSubscription = () => () => undefined;
const linkedFinish = () => new URLSearchParams(window.location.search).get("finish");

function StockLine({ piece, left }: { piece: ProductDto; left: number | undefined }) {
  if (piece.soldOut || left === 0) return <span className="status status-muted">Sold out</span>;
  if (left === undefined) return null;
  if (left <= 5) return <span className="status status-warn">Only {left} left</span>;
  return <span className="status status-ok">In stock</span>;
}

export function ProductView({
  piece,
  category,
  images,
  children,
}: {
  piece: ProductDto;
  category: CategoryDto | undefined;
  images: string[];
  children: ReactNode;
}) {
  // The cached page ignores the query string: a shared `?finish=` link picks its finish once hydrated.
  const linked = useSyncExternalStore(noSubscription, linkedFinish, () => null);
  const [picked, setVariantId] = useState<string | null>(null);
  const variantId = picked ?? (piece.variants.some((v) => v.id === linked) ? linked! : piece.variants[0].id);
  const [pickedIndex, setIndex] = useState<number | null>(null);
  const index = pickedIndex ?? Math.max(0, images.indexOf(variantImage(piece, variantId)));
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const available = useLiveStock(piece);
  const variant = piece.variants.find((v) => v.id === variantId) ?? piece.variants[0];
  const left = available ? (available[variant.sku] ?? undefined) : undefined;
  const soldOut = piece.soldOut || left === 0;

  const chooseFinish = (id: string) => {
    setVariantId(id);
    const i = images.indexOf(variantImage(piece, id));
    if (i >= 0) setIndex(i);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-14">
      <div className="-mx-4 sm:mx-0 lg:col-span-7">
        <div className="px-4 sm:px-0">
          <Gallery name={piece.name} images={images} index={index} onIndex={setIndex} />
        </div>
      </div>

      <div className="lg:col-span-5">
        <nav aria-label="Breadcrumb" className="text-sm text-stone">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/shop" className="hover:text-ink">
                Shop
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href={`/shop/${piece.categoryId}`} className="hover:text-ink">
                {category?.label}
              </Link>
            </li>
          </ol>
        </nav>
        <h1 className="title mt-4">{piece.name}</h1>
        <p className="mt-1.5 text-lg text-stone">{piece.kind}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="text-2xl tabular tracking-[-0.02em]">{money(piece.priceCents)}</p>
          <StockLine piece={piece} left={left} />
        </div>
        {piece.rating.count && piece.rating.average !== null ? (
          <a href="#reviews" className="mt-3 inline-flex items-center gap-2 rounded-full text-sm text-stone hover:text-ink">
            <Stars rating={piece.rating.average} />
            <span className="tabular">
              {piece.rating.average.toFixed(1)} · {plural(piece.rating.count, "review")}
            </span>
          </a>
        ) : null}
        <p className="lede mt-5 max-w-[48ch]">{piece.story}</p>

        <div className="mt-8">
          <p className="label" id="finish-label">
            Finish <span className="font-normal text-stone">· {variant.label}</span>
          </p>
          <SwatchPicker piece={piece} value={variantId} onChange={chooseFinish} available={available} soldOut={piece.soldOut} />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <QtyStepper label="Quantity" value={qty} min={1} max={MAX_QTY} onChange={setQty} disabled={soldOut} />
          <button
            type="button"
            className="btn btn-primary min-w-0 flex-1"
            disabled={soldOut}
            onClick={() => {
              addToCart({ sku: variant.sku, slug: piece.slug, variantId: variant.id }, qty);
              setAdded(true);
              window.setTimeout(() => setAdded(false), 2200);
              openPanel("cart");
            }}
          >
            {soldOut ? (
              "Sold out"
            ) : added ? (
              <>
                <Icon name="check" size={18} /> Added to cart
              </>
            ) : (
              <span>
                Add to cart<span className="hidden sm:inline"> · {money(piece.priceCents * qty)}</span>
              </span>
            )}
          </button>
          <SaveButton slug={piece.slug} name={piece.name} variant="outline" />
        </div>
        {soldOut ? <StockAlertForm key={variant.sku} piece={piece} variant={variant} /> : null}
        <p className="mt-5 flex gap-2.5 rounded-[14px] bg-plaster px-4 py-3 text-sm text-stone">
          <Icon name="info" size={18} className="mt-px shrink-0 text-ink" />
          <span>This is a demo store. Checkout runs in a sandbox, so no card is charged and nothing ships.</span>
        </p>

        <div className="mt-8 border-t border-line">{children}</div>
      </div>
    </div>
  );
}
