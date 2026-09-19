"use client";

import type { PricingBreakdown } from "@meridian/contracts";
import type { ReactNode } from "react";
import { Plate } from "@/components/ui/Plate";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/format";

export type SummaryLine = { key: string; name: string; label: string; qty: number; totalCents: number; image: string | null };

function Row({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "mt-2 border-t border-line-strong/60 pt-4 text-lg font-medium" : ""}`}>
      <dt className={strong ? undefined : "text-stone"}>{label}</dt>
      <dd className="tabular">{children}</dd>
    </div>
  );
}

const Pending = () => <Skeleton className="h-5 w-16" />;

/** Lines and the pricing breakdown (VAT-inclusive, with the VAT contained in the total). */
export function PricingList({ pricing, couponCode, shippingLabel, loading }: { pricing: PricingBreakdown | null; couponCode: string | null; shippingLabel?: string; loading?: boolean }) {
  const show = (render: (p: PricingBreakdown) => ReactNode) => (pricing ? render(pricing) : <Pending />);
  return (
    <dl className={`grid gap-2.5 text-[0.9375rem] transition-opacity duration-200 ${loading && pricing ? "opacity-60" : ""}`} aria-busy={loading || undefined} aria-label="Price breakdown">
      <Row label="Subtotal">{show((p) => money(p.subtotalCents))}</Row>
      <Row label={`Discount${couponCode ? ` (${couponCode})` : ""}`}>{show((p) => (p.discountCents ? `−${money(p.discountCents)}` : money(0)))}</Row>
      <Row label={shippingLabel ?? "Delivery"}>{show((p) => (p.shippingCents ? money(p.shippingCents) : "Free"))}</Row>
      <Row label="Total" strong>
        {show((p) => money(p.totalCents))}
      </Row>
      <div className="flex justify-between gap-4 text-sm text-stone">
        <dt>{pricing ? `Includes VAT (${pricing.taxRatePercent}%)` : "Includes VAT"}</dt>
        <dd className="tabular">{show((p) => money(p.taxCents))}</dd>
      </div>
    </dl>
  );
}

export function SummaryLines({ lines }: { lines: SummaryLine[] }) {
  return (
    <ul className="grid gap-4" aria-label="Items">
      {lines.map((l) => (
        <li key={l.key} className="flex items-center gap-4">
          <div className="well relative aspect-[4/5] w-16 shrink-0 !rounded-[10px] bg-paper">
            {l.image ? <Plate src={l.image} alt="" sizes="64px" /> : null}
            <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-cobalt px-[5px] text-[0.6875rem] font-semibold leading-none text-paper tabular" aria-hidden="true">
              {l.qty}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{l.name}</p>
            <p className="truncate text-sm text-stone">
              {l.label}
              <span className="sr-only">, quantity {l.qty}</span>
            </p>
          </div>
          <p className="tabular">{money(l.totalCents)}</p>
        </li>
      ))}
    </ul>
  );
}
