"use client";

import { useState } from "react";
import { addToCart, openPanel } from "@/lib/stores";
import { Icon } from "../ui/Icon";

export function AddSetButton({ lines, label }: { lines: { sku: string; slug: string; variantId: string; qty: number }[]; label: string }) {
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary mt-6 w-full sm:w-auto"
      onClick={() => {
        for (const { qty, ...line } of lines) addToCart(line, qty);
        setAdded(true);
        window.setTimeout(() => setAdded(false), 2200);
        openPanel("cart");
      }}
    >
      {added ? (
        <span className="inline-flex items-center gap-2">
          <Icon name="check" size={18} /> Added to cart
        </span>
      ) : (
        label
      )}
    </button>
  );
}
