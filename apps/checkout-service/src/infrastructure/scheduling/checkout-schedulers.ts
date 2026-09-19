import { envInt } from "@meridian/nest-kit";
import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { ExpireOrdersCommand, PurgeIdleCartsCommand } from "../../application/commands";
import { PrismaIdempotencyStore } from "../persistence/prisma-idempotency.store";
import { PeriodicJob } from "./periodic-job";

/** Order expiry sweep (ORDER_EXPIRY_SWEEP_MS) and daily housekeeping (idle guest carts, old idempotency keys). */
@Injectable()
export class CheckoutSchedulers implements OnApplicationBootstrap {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly idempotency: PrismaIdempotencyStore,
  ) {}

  onApplicationBootstrap(): void {
    const sweepMs = envInt("ORDER_EXPIRY_SWEEP_MS", 60_000, { min: 1_000 });
    new PeriodicJob("order-expiry-sweep", sweepMs, () => this.commandBus.execute(new ExpireOrdersCommand())).start();

    const housekeepingMs = envInt("CART_PURGE_INTERVAL_MS", 86_400_000, { min: 60_000 });
    new PeriodicJob(
      "checkout-housekeeping",
      housekeepingMs,
      async () => {
        await this.commandBus.execute(new PurgeIdleCartsCommand());
        await this.idempotency.purgeExpired();
      },
      Math.min(housekeepingMs, 5 * 60_000),
    ).start();
  }
}
