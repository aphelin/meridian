"use client";

import { trpc } from "@/lib/trpc";

export type StockIssue = { kind: "soldout" | "short" | "low"; text: string };

/** Live availability for the SKUs in the cart (null while unknown; warnings are advisory, checkout re-checks). */
export function useCartStock(skus: string[]): Map<string, number> | null {
  const unique = [...new Set(skus)].sort().slice(0, 100);
  const stock = trpc.catalog.stock.useQuery({ skus: unique }, { enabled: unique.length > 0, staleTime: 15_000, placeholderData: (previous) => previous });
  if (!stock.data) return null;
  return new Map(stock.data.map((s) => [s.sku, s.available]));
}

export const LOW_STOCK = 3;

/** `soldOut` is the catalog's piece-level flag: the piece can't be ordered whatever the per-SKU counts say. */
export function stockIssue(qty: number, available: number | undefined, soldOut = false): StockIssue | null {
  if (soldOut) return { kind: "soldout", text: "Sold out. Remove it to check out." };
  if (available === undefined) return null;
  if (available <= 0) return { kind: "soldout", text: "Sold out. Remove it to check out." };
  if (available < qty) return { kind: "short", text: `Only ${available} available. Lower the quantity to check out.` };
  if (available <= LOW_STOCK) return { kind: "low", text: `Only ${available} left` };
  return null;
}

/** Lines that stop checkout: sold out (catalog flag or live count) or more than is available. */
export function blockingLines<L extends { sku: string; qty: number; piece?: { soldOut: boolean } }>(lines: L[], stock: Map<string, number> | null): L[] {
  return lines.filter((l) => {
    const issue = stockIssue(l.qty, stock?.get(l.sku), l.piece?.soldOut);
    return issue && issue.kind !== "low";
  });
}

export function blockingIssues(lines: { sku: string; qty: number; piece?: { soldOut: boolean } }[], stock: Map<string, number> | null) {
  return blockingLines(lines, stock).length;
}
