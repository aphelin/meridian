import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { CartRepository, GUEST_CART_IDLE_DAYS } from "../../domain";
import { PurgeIdleCartsCommand } from "./purge-idle-carts.command";

/** Deletes guest carts idle for GUEST_CART_IDLE_DAYS (user carts are kept). */
@CommandHandler(PurgeIdleCartsCommand)
export class PurgeIdleCartsHandler implements ICommandHandler<PurgeIdleCartsCommand, { purged: number }> {
  constructor(
    private readonly carts: CartRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(_command: PurgeIdleCartsCommand): Promise<{ purged: number }> {
    const before = new Date(this.clock.now().getTime() - GUEST_CART_IDLE_DAYS * 86_400_000);
    return { purged: await this.carts.purgeGuestCartsIdleSince(before) };
  }
}
