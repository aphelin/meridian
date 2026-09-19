import type { SkuQty } from "@meridian/contracts";

export class ReserveStockCommand {
  constructor(
    readonly orderId: string,
    readonly lines: SkuQty[],
  ) {}
}
