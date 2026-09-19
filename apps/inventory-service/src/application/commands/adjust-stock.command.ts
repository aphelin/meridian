import type { Adjustment } from "../../domain";

export class AdjustStockCommand {
  constructor(
    readonly sku: string,
    readonly adjustment: Adjustment,
    readonly reason: string,
    readonly actorId: string | null,
  ) {}
}
