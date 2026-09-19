import { CLOCK, type Clock } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { OrderRepository } from "../../domain";
import { CheckoutSettings } from "../ports";
import { OrderCancellation } from "../services";
import { ExpireOrdersCommand } from "./expire-orders.command";

export const EXPIRY_BATCH_SIZE = 500;
const log = createLogger("ExpireOrders");

/**
 * Expiry sweep: unpaid orders older than the hold are cancelled (reason expired) and their stock released. Each order
 * is its own version-guarded transaction, so a payment confirmation racing the sweep either wins (order stays paid)
 * or loses and voids its payment. Safe to run on every replica at once.
 */
@CommandHandler(ExpireOrdersCommand)
export class ExpireOrdersHandler implements ICommandHandler<ExpireOrdersCommand, { expired: number }> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly cancellation: OrderCancellation,
    private readonly settings: CheckoutSettings,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ExpireOrdersCommand): Promise<{ expired: number }> {
    const now = this.clock.now();
    const olderThanSeconds = command.olderThanSeconds ?? this.settings.orderHoldMinutes * 60;
    const ids = await this.orders.findUnpaidIds({ placedBefore: new Date(now.getTime() - olderThanSeconds * 1000), limit: EXPIRY_BATCH_SIZE });
    let expired = 0;
    for (const id of ids) {
      try {
        if (await this.cancellation.cancelUnpaid(id, "expired", "expired", now)) expired++;
      } catch (error) {
        log.error("could not expire order", { orderId: id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (expired) log.info("expired unpaid orders", { expired, olderThanSeconds });
    return { expired };
  }
}
