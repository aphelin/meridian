import { createLogger } from "@meridian/nest-kit";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { assertOrderId, StockLines } from "../../domain";
import { UnitOfWork } from "../ports";
import { RESTOCK_CONSUMER, RESTOCK_SOURCE_CONSUMER, RestockItemsCommand } from "./restock-items.command";
import { lockOrCreateStock, saveAll } from "./stock-locking";

const log = createLogger("RestockItems");

export interface RestockResult {
  applied: boolean;
}

/** Returned goods back on hand: onHand += qty per line (movement + StockAdjusted, StockReplenished on 0 → >0). Inbox-idempotent. */
@CommandHandler(RestockItemsCommand)
export class RestockItemsHandler implements ICommandHandler<RestockItemsCommand, RestockResult> {
  constructor(
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ orderId, returnId, lines: input, messageId }: RestockItemsCommand): Promise<RestockResult> {
    assertOrderId(orderId);
    const lines = StockLines.of(input);
    const sourceKey = returnId ? `return:${returnId}` : `order:${orderId}`;
    return this.uow.run(async (tx) => {
      if (!(await tx.claim(RESTOCK_CONSUMER, messageId))) {
        log.info("duplicate restock command ignored", { orderId, messageId });
        return { applied: false };
      }
      if (!(await tx.claim(RESTOCK_SOURCE_CONSUMER, sourceKey))) {
        log.warn("restock for an already restocked source ignored", { orderId, returnId, messageId });
        return { applied: false };
      }
      const now = this.clock.now();
      const items = await lockOrCreateStock(tx, lines, now);
      for (const line of lines.items) items.get(line.sku)!.restock(line.qty, orderId, now);
      await tx.publish(await saveAll(tx, items));
      return { applied: true };
    });
  }
}
