import type { AdminStockDto } from "@meridian/contracts";
import { CLOCK, NotFoundError, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Sku, StockItem } from "../../domain";
import { toAdminStockDto } from "../dto";
import { UnitOfWork } from "../ports";
import { AdjustStockCommand } from "./adjust-stock.command";

/**
 * Admin correction under the row lock: movement + StockAdjusted (+ StockDepleted / StockReplenished).
 * An absolute level creates an unknown SKU; a delta on an unknown SKU is 404.
 */
@CommandHandler(AdjustStockCommand)
export class AdjustStockHandler implements ICommandHandler<AdjustStockCommand, AdminStockDto> {
  constructor(
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ sku: input, adjustment, reason, actorId }: AdjustStockCommand): Promise<AdminStockDto> {
    const sku = Sku.of(input).value;
    return this.uow.run(async (tx) => {
      const now = this.clock.now();
      let item = await tx.stock.lock(sku);
      if (!item && adjustment.onHand !== undefined) {
        await tx.stock.insertIfMissing(StockItem.create(sku, 0, now));
        item = await tx.stock.lock(sku);
      }
      if (!item) throw new NotFoundError(`No stock record for ${sku}.`, { sku });
      if (item.adjust(adjustment, reason, actorId, now)) {
        await tx.stock.save(item);
        await tx.publish(item.pullEvents());
      }
      return toAdminStockDto(item);
    });
  }
}
