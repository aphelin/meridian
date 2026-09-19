"use client";

import { useRef, type KeyboardEvent } from "react";
import type { ProductDto } from "@meridian/contracts";

export function SwatchPicker({
  piece,
  value,
  onChange,
  available,
  soldOut = false,
}: {
  piece: ProductDto;
  value: string;
  onChange: (id: string) => void;
  available?: Record<string, number> | null;
  /** The whole piece is sold out (catalog flag): every finish renders struck, whatever the live counts say. */
  soldOut?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent, index: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + piece.variants.length) % piece.variants.length;
    onChange(piece.variants[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={`${piece.name} finish`} className="flex flex-wrap gap-2">
      {piece.variants.map((v, i) => {
        const checked = v.id === value;
        const out = soldOut || (available ? (available[v.sku] ?? 1) <= 0 : false);
        return (
          <button
            key={v.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${v.label}${out ? ", sold out" : ""}`}
            tabIndex={checked ? 0 : -1}
            className="swatch-ring group relative"
            onClick={() => onChange(v.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className={`swatch block size-12 ${out ? "opacity-45" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- material texture swatch */}
              <img src={v.swatchUrl} alt="" />
            </span>
            {out ? (
              <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-px w-11 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-ink" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
