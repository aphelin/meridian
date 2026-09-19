"use client";

import type { CatalogSnapshotDto } from "@meridian/contracts";
import { Alert } from "@/components/ui/alert";
import { errorCode } from "@/lib/errors";
import { bySku } from "@/lib/product";
import { setCartQty } from "@/lib/stores";

type ClientError = { message: string; data?: { code?: string; details?: unknown } | null } | null | undefined;

/** The line an OUT_OF_STOCK error from `cart.setLines`, `checkout.quote` or `checkout.place` points at (`details.sku`). */
export function outOfStockLine(error: ClientError, catalog: CatalogSnapshotDto) {
  if (errorCode(error) !== "OUT_OF_STOCK") return null;
  const details = (error?.data?.details ?? {}) as { sku?: string; available?: number };
  const hit = details.sku ? bySku(catalog, details.sku) : undefined;
  return { sku: details.sku ?? null, available: details.available ?? 0, name: hit ? `${hit.product.name} (${hit.variant.label})` : null };
}

/** A stock message naming the piece, with a button that removes it from the cart (never a generic error). */
export function OutOfStockAlert({ error, catalog, className, onRemoved }: { error: ClientError; catalog: CatalogSnapshotDto; className?: string; onRemoved?: () => void }) {
  const line = outOfStockLine(error, catalog);
  if (!line) return null;
  const what = line.name ?? "One of the pieces in your cart";
  return (
    <Alert className={className}>
      <p>{line.available > 0 ? `${what} has only ${line.available} left. Lower the quantity or remove it to check out.` : `${what} is sold out. Remove it to check out.`}</p>
      {line.sku ? (
        <button type="button" className="mt-1.5 font-medium underline underline-offset-4" onClick={() => {
            setCartQty(line.sku!, 0);
            onRemoved?.();
          }}>
          {line.name ? `Remove ${line.name}` : "Remove it from your cart"}
        </button>
      ) : null}
    </Alert>
  );
}
