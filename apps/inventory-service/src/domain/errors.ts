import { DomainError } from "@meridian/kernel";

/** 409 OUT_OF_STOCK with the first line that cannot be satisfied. */
export class OutOfStockError extends DomainError {
  constructor(
    readonly sku: string,
    readonly available: number,
    readonly requested: number,
  ) {
    super("OUT_OF_STOCK", available > 0 ? `Only ${available} of ${sku} left in stock.` : `${sku} is out of stock.`, { sku, available });
    this.name = "OutOfStockError";
  }
}
