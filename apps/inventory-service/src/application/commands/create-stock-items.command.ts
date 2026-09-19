export interface NewStockItem {
  sku: string;
  onHand: number;
}

export interface CreateStockItemsResult {
  created: number;
}

/** Creates SKUs that have no stock row yet; existing rows are never touched. Used by POST /seed. */
export class SeedStockCommand {
  constructor(readonly items: NewStockItem[]) {}
}

/**
 * Creates stock rows for catalog SKUs that have none (group inventory-catalog-sync): DEFAULT_STOCK_ON_HAND, or 0 when
 * the product snapshot is flagged soldOut (amendment 1p). Existing rows are never changed by the flag.
 */
export class SyncCatalogStockCommand {
  constructor(
    readonly skus: string[],
    readonly productId: string,
    readonly soldOut = false,
  ) {}
}
