"use client";

import { Icon } from "./Icon";

export function QtyStepper({
  value,
  min = 1,
  max = 20,
  onChange,
  label,
  size = "md",
  disabled = false,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
  label: string;
  size?: "sm" | "md";
  /** Disables both buttons, e.g. while the piece is sold out. */
  disabled?: boolean;
}) {
  const h = size === "sm" ? "h-9" : "h-12";
  const w = size === "sm" ? "w-9" : "w-11";
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex ${h} items-center rounded-full bg-paper shadow-[inset_0_0_0_1px_var(--color-line-strong)]`}
    >
      <button
        type="button"
        className={`grid ${h} ${w} place-items-center rounded-full text-ink transition-colors hover:bg-plaster disabled:text-line-strong disabled:hover:bg-transparent`}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        <Icon name="minus" size={16} />
      </button>
      <output className={`min-w-6 text-center text-[0.9375rem] font-medium tabular ${disabled ? "text-stone" : ""}`} aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className={`grid ${h} ${w} place-items-center rounded-full text-ink transition-colors hover:bg-plaster disabled:text-line-strong disabled:hover:bg-transparent`}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
