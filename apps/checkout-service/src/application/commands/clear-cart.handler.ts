import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { CartRepository } from "../../domain";
import { CartResolver, retryOnConflict } from "../services";
import { ClearCartCommand } from "./clear-cart.command";

@CommandHandler(ClearCartCommand)
export class ClearCartHandler implements ICommandHandler<ClearCartCommand, void> {
  constructor(
    private readonly carts: CartRepository,
    private readonly resolver: CartResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ClearCartCommand): Promise<void> {
    await retryOnConflict(async () => {
      const cart = await this.resolver.existing(command.userId, command.cartId);
      if (!cart || cart.isEmpty) return;
      cart.clear(this.clock.now());
      await this.carts.save(cart);
    });
  }
}
