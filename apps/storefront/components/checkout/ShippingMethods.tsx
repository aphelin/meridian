"use client";

import type { ShippingMethodId, ShippingOptionDto } from "@meridian/contracts";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/format";

export function etaLabel(option: Pick<ShippingOptionDto, "etaDays">) {
  if (!option.etaDays) return null;
  const [from, to] = option.etaDays;
  return from === to ? `${from} working days` : `${from}–${to} working days`;
}

/** Shipping method radio cards with price and delivery estimate, straight from the live quote. */
export function ShippingMethods({ options, value, onChange }: { options: ShippingOptionDto[] | null; value: ShippingMethodId; onChange: (id: ShippingMethodId) => void }) {
  if (!options) {
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" aria-busy="true" aria-label="Loading shipping methods">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px] !rounded-[14px]" />
        ))}
      </div>
    );
  }
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as ShippingMethodId)} className="mt-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" aria-label="Shipping method">
      {options.map((option) => {
        const eta = etaLabel(option);
        const price = option.priceCents ? money(option.priceCents) : "Free";
        // The estimate has its own line; keep only what the description adds to it.
        const note = eta ? option.description.replace(/^[^.]*\b\d+\s*[–-]\s*\d+[^.]*\.\s*/, "").trim() : option.description;
        return (
          <label
            key={option.id}
            htmlFor={`shipping-${option.id}`}
            className="flex cursor-pointer gap-3 rounded-[14px] bg-raised p-4 shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_var(--color-ink)] has-[[data-state=checked]]:shadow-[inset_0_0_0_2px_var(--color-ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt"
          >
            <RadioGroupItem id={`shipping-${option.id}`} value={option.id} className="mt-0.5" aria-label={`${option.label}, ${price}${eta ? `, ${eta}` : ""}`} />
            <span className="min-w-0 flex-1">
              <span className="flex justify-between gap-3 font-medium">
                {option.label}
                <span className="tabular">{price}</span>
              </span>
              {eta ? <span className="block text-sm text-ink">{eta}</span> : null}
              {note ? <span className="block text-sm text-stone">{note}</span> : null}
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
