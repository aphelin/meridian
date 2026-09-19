"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { ProductDto, VariantDto } from "@meridian/contracts";
import { addToCart, openPanel } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { Icon } from "../ui/Icon";

/** The finish to add: the one on show when it is in stock, else the first finish in stock. Null when all are sold out. */
export function pickInStockVariant(piece: ProductDto, shown: VariantDto | undefined, available: Map<string, number> | null): VariantDto | null {
  const order = [...(shown ? [shown] : []), ...piece.variants.filter((v) => v.id !== shown?.id)];
  // Inventory unavailable: fall back to the finish on show; checkout re-checks stock when the order is placed.
  if (!available) return piece.soldOut ? null : (order[0] ?? null);
  return order.find((v) => (available.get(v.sku) ?? 0) > 0) ?? null;
}

/** Card-level "Quick add": checks live stock for the piece's finishes, then adds one of an in-stock finish to the cart. */
export function QuickAdd({ piece, shown }: { piece: ProductDto; shown: VariantDto | undefined }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");

  const run = async () => {
    if (state === "busy") return;
    setState("busy");
    let available: Map<string, number> | null = null;
    try {
      const rows = await utils.catalog.stock.fetch({ skus: piece.variants.map((v) => v.sku) }, { staleTime: 0 });
      available = new Map(rows.map((r) => [r.sku, r.available]));
    } catch {
      available = null;
    }
    const variant = pickInStockVariant(piece, shown, available);
    if (!variant) {
      setState("idle");
      toast(`${piece.name} is sold out`, {
        id: `quick-add-${piece.slug}`,
        description: "Open the piece to get an email when a finish is back.",
        action: { label: "View", onClick: () => router.push(`/product/${piece.slug}`) },
      });
      return;
    }
    addToCart({ sku: variant.sku, slug: piece.slug, variantId: variant.id }, 1);
    setState("added");
    openPanel("cart");
    window.setTimeout(() => setState("idle"), 2200);
  };

  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-paper/95 px-2.5 text-sm font-medium text-ink shadow-[0_6px_18px_-8px_rgb(27_26_23/0.35)] transition-[background-color,opacity,transform] duration-200 hover:bg-paper active:scale-95 disabled:cursor-progress md:px-3.5 md:pointer-fine:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100"
      aria-label={`Quick add ${piece.name}`}
      aria-busy={state === "busy" || undefined}
      disabled={state === "busy"}
      onClick={run}
    >
      {state === "busy" ? <span className="spinner" aria-hidden="true" /> : <Icon name={state === "added" ? "check" : "plus"} size={18} />}
      <span className="hidden md:inline">{state === "added" ? "Added" : "Quick add"}</span>
    </button>
  );
}
