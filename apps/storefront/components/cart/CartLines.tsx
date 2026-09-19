"use client";

import type { CatalogSnapshotDto, ProductDto, VariantDto } from "@meridian/contracts";
import Link from "next/link";
import { money } from "@/lib/format";
import { variantImage } from "@/lib/product";
import { MAX_QTY, setCartQty, type CartLine } from "@/lib/stores";
import { Plate } from "../ui/Plate";
import { QtyStepper } from "../ui/QtyStepper";
import { stockIssue } from "./stock";

export type ResolvedLine = CartLine & { piece: ProductDto; variant: VariantDto };

/** Device cart lines joined with the published catalog; lines for products no longer published are left out. */
export function resolveLines(lines: CartLine[], catalog: CatalogSnapshotDto): ResolvedLine[] {
  const bySlug = new Map(catalog.products.map((p) => [p.slug, p]));
  return lines.flatMap((line) => {
    const piece = bySlug.get(line.slug);
    const variant = piece?.variants.find((v) => v.sku === line.sku);
    return piece && variant ? [{ ...line, piece, variant }] : [];
  });
}

/** Subtotal at catalog prices (the checkout quote is authoritative). */
export function subtotal(lines: ResolvedLine[]) {
  return lines.reduce((n, l) => n + l.piece.priceCents * l.qty, 0);
}

export function CartLines({ lines, size = "sm", onNavigate, stock }: { lines: ResolvedLine[]; size?: "sm" | "lg"; onNavigate?: () => void; stock?: Map<string, number> | null }) {
  const thumb = size === "lg" ? "w-24 sm:w-32" : "w-[84px]";
  return (
    <ul className="divide-y divide-line">
      {lines.map((line) => {
        const href = `/product/${line.piece.slug}`;
        const available = stock?.get(line.sku);
        const issue = stockIssue(line.qty, available, line.piece.soldOut);
        const issueId = `stock-${line.sku}`;
        return (
          <li key={line.sku} className="flex gap-4 py-5 first:pt-0 sm:gap-5">
            <Link href={href} onClick={onNavigate} className={`${thumb} shrink-0`} tabIndex={-1} aria-label={`${line.piece.name}, ${line.variant.label}`}>
              <div className="well aspect-[4/5] !rounded-[12px]">
                <Plate src={variantImage(line.piece, line.variantId)} alt="" sizes={size === "lg" ? "128px" : "84px"} />
              </div>
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={href} onClick={onNavigate} className="font-medium leading-snug hover:underline">
                    {line.piece.name}
                  </Link>
                  <p className="truncate text-sm text-stone">{line.piece.kind}</p>
                  <p className="truncate text-sm text-stone">{line.variant.label}</p>
                  {issue ? (
                    issue.kind === "low" ? (
                      <p id={issueId} className="status status-warn mt-1.5">
                        {issue.text}
                      </p>
                    ) : (
                      <p id={issueId} className="hint !mt-1.5 !text-brick" role="alert">
                        {issue.text}
                      </p>
                    )
                  ) : null}
                </div>
                <p className="shrink-0 tabular">{money(line.piece.priceCents * line.qty)}</p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <QtyStepper
                  size="sm"
                  label={`${line.piece.name} quantity`}
                  value={line.qty}
                  min={1}
                  max={Math.max(1, Math.min(MAX_QTY, available ?? MAX_QTY))}
                  disabled={line.piece.soldOut}
                  onChange={(n) => setCartQty(line.sku, n)}
                />
                <button
                  type="button"
                  className="-my-2.5 py-2.5 text-sm text-stone underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
                  onClick={() => setCartQty(line.sku, 0)}
                  aria-label={`Remove ${line.piece.name} ${line.variant.label}`}
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
