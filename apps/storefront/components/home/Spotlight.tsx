"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProductDto } from "@meridian/contracts";
import { money } from "@/lib/format";
import { variantImage } from "@/lib/product";
import { Plate } from "../ui/Plate";
import { SwatchPicker } from "../product/SwatchPicker";

export function Spotlight({ piece, copy }: { piece: ProductDto; copy: string }) {
  const details = piece.details;
  const [active, setActive] = useState(piece.variants[0]?.id ?? "");
  const [mounted, setMounted] = useState([active]);
  const variant = piece.variants.find((v) => v.id === active) ?? piece.variants[0];

  const choose = (id: string) => {
    setActive(id);
    setMounted((m) => (m.includes(id) ? m : [...m, id]));
  };

  return (
    <section className="shell mt-24 md:mt-32" aria-labelledby="spotlight-title">
      <div className="grid items-center gap-8 md:grid-cols-12 md:gap-12">
        <div className="md:col-span-6 lg:col-span-5 lg:col-start-2">
          <div className="well aspect-[4/5]">
            {piece.variants
              .filter((v) => mounted.includes(v.id))
              .map((v) => (
                <Plate
                  key={v.id}
                  src={variantImage(piece, v.id)}
                  alt={`${piece.name} in ${v.label.toLowerCase()}`}
                  sizes="(min-width: 1024px) 36vw, (min-width: 768px) 48vw, 92vw"
                  hidden={v.id !== active}
                  className="plate"
                />
              ))}
          </div>
        </div>
        <div className="md:col-span-6 lg:col-span-5 lg:col-start-8">
          <h2 id="spotlight-title" className="title">
            {piece.name} in two wool colours
          </h2>
          <p className="mt-2 text-lg text-stone">{piece.kind}</p>
          <p className="lede mt-6 max-w-[42ch]">{copy}</p>
          <div className="mt-8">
            <p className="label">
              Finish <span className="font-normal text-stone">· {variant?.label}</span>
            </p>
            <SwatchPicker piece={piece} value={active} onChange={choose} />
          </div>
          <dl className="mt-8 grid max-w-[42ch] grid-cols-2 gap-y-1 border-t border-line pt-5 text-sm">
            <dt className="text-stone">Price</dt>
            <dd className="text-right tabular">{money(piece.priceCents)}</dd>
            {details.widthCm && details.depthCm && details.heightCm ? (
              <>
                <dt className="text-stone">Size</dt>
                <dd className="text-right tabular">
                  {details.widthCm} × {details.depthCm} × {details.heightCm} cm
                </dd>
              </>
            ) : null}
          </dl>
          <Link href={`/product/${piece.slug}?finish=${active}`} className="btn btn-primary mt-8">
            Shop {piece.name}
          </Link>
        </div>
      </div>
    </section>
  );
}
