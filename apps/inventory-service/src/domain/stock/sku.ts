import { ValidationError } from "@meridian/kernel";

const SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Stock keeping unit code: 1–64 characters of letters, digits, dot, underscore or dash. Case is preserved. */
export class Sku {
  private constructor(readonly value: string) {}

  static of(input: unknown): Sku {
    const value = typeof input === "string" ? input.trim() : "";
    if (!SKU.test(value)) throw new ValidationError(`Invalid SKU "${String(input)}".`);
    return new Sku(value);
  }

  toString() {
    return this.value;
  }
}

export const MAX_UNITS = 1_000_000;

/** A whole, positive number of units. */
export function assertQuantity(qty: number, label = "quantity"): void {
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > MAX_UNITS) throw new ValidationError(`The ${label} must be a whole number between 1 and ${MAX_UNITS}.`);
}

/** A whole, non-negative stock level. */
export function assertStockLevel(units: number, label = "stock level"): void {
  if (!Number.isSafeInteger(units) || units < 0 || units > MAX_UNITS) throw new ValidationError(`The ${label} must be a whole number between 0 and ${MAX_UNITS}.`);
}
