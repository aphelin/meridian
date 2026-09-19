import type { CartDto } from "@meridian/contracts";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { CartRepository } from "../../domain";
import { toCartDto } from "../mappers/cart-dto.mapper";
import { UnitOfWork } from "../ports";
import { CartResolver, retryOnConflict } from "../services";
import { MergeCartCommand } from "./merge-cart.command";

/** Signs a guest basket into the user's cart: quantities summed per SKU (capped), guest cart emptied, atomically. */
@CommandHandler(MergeCartCommand)
export class MergeCartHandler implements ICommandHandler<MergeCartCommand, CartDto> {
  constructor(
    private readonly carts: CartRepository,
    private readonly resolver: CartResolver,
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(command: MergeCartCommand): Promise<CartDto> {
    return retryOnConflict(() =>
      this.uow.run(async (tx) => {
        const now = this.clock.now();
        const userCart = await this.resolver.resolve(command.userId, null, tx);
        const guest = command.guestCartId ? await this.resolver.existing(null, command.guestCartId, tx) : null;
        if (guest && guest.id !== userCart.id) {
          userCart.mergeFrom(guest, now);
          await this.carts.save(guest, tx);
        }
        await this.carts.save(userCart, tx);
        return toCartDto(userCart);
      }),
    );
  }
}
