import { createLogger } from "@meridian/nest-kit";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { compareSku, Sku, StockItem } from "../../domain";
import { INVENTORY_SETTINGS, UnitOfWork, type InventorySettings } from "../ports";
import { SeedStockCommand, SyncCatalogStockCommand, type CreateStockItemsResult, type NewStockItem } from "./create-stock-items.command";

const log = createLogger("StockItems");

/** Inserts missing SKUs (first occurrence wins) in SKU order inside one transaction. */
async function createMissing(uow: UnitOfWork, clock: Clock, requested: NewStockItem[]): Promise<CreateStockItemsResult> {
  const unique = new Map<string, number>();
  for (const { sku, onHand } of requested) {
    const code = Sku.of(sku).value;
    if (!unique.has(code)) unique.set(code, onHand);
  }
  const now = clock.now();
  const items = [...unique.entries()].sort(([a], [b]) => compareSku(a, b)).map(([sku, onHand]) => StockItem.create(sku, onHand, now));
  if (!items.length) return { created: 0 };
  return uow.run(async (tx) => {
    let created = 0;
    for (const item of items) if (await tx.stock.insertIfMissing(item)) created += 1;
    return { created };
  });
}

@CommandHandler(SeedStockCommand)
export class SeedStockHandler implements ICommandHandler<SeedStockCommand, CreateStockItemsResult> {
  constructor(
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute({ items }: SeedStockCommand): Promise<CreateStockItemsResult> {
    return createMissing(this.uow, this.clock, items);
  }
}

@CommandHandler(SyncCatalogStockCommand)
export class SyncCatalogStockHandler implements ICommandHandler<SyncCatalogStockCommand, CreateStockItemsResult> {
  constructor(
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(INVENTORY_SETTINGS) private readonly settings: InventorySettings,
  ) {}

  async execute({ skus, productId, soldOut }: SyncCatalogStockCommand): Promise<CreateStockItemsResult> {
    const onHand = StockItem.openingOnHandForCatalog(this.settings.defaultOnHand, soldOut);
    const result = await createMissing(
      this.uow,
      this.clock,
      skus.map((sku) => ({ sku, onHand })),
    );
    if (result.created) log.info("stock created for catalog SKUs", { productId, created: result.created, onHand, soldOut });
    return result;
  }
}
