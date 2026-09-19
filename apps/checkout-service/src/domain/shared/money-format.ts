import type { Cents } from "@meridian/contracts";

/** Shopper-facing euro amount, e.g. 50000 -> "€500.00". */
export function formatEuros(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}€${whole}.${(abs % 100).toString().padStart(2, "0")}`;
}
