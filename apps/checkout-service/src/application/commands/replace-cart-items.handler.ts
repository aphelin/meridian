import type { CartDto } from "@meridian/contracts";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { CartRepository } from "../../domain";
import { toCartDto } from "../mappers/cart-dto.mapper";
import { CartResolver, LinePricer, retryOnConflict } from "../services";
import { ReplaceCartItemsCommand } from "./replace-cart-items.command";

/** Replaces the basket with catalog-priced lines (unknown SKUs and wrong variants are rejected). */
@CommandHandler(ReplaceCartItemsCommand)
export class ReplaceCartItemsHandler implements ICommandHandler<ReplaceCartItemsCommand, CartDto> {
  constructor(
    private readonly carts: CartRepository,
    private readonly resolver: CartResolver,
    private readonly pricer: LinePricer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ReplaceCartItemsCommand): Promise<CartDto> {
    const priced = await this.pricer.price(command.lines);
    return retryOnConflict(async () => {
      const cart = await this.resolver.resolve(command.userId, command.cartId);
      cart.replaceLines(
        priced.map((line) => ({ sku: line.sku, variantId: line.variantId, slug: line.slug, qty: line.qty, unitPriceCents: line.unitPrice.cents })),
        this.clock.now(),
      );
      await this.carts.save(cart);
      return toCartDto(cart);
    });
  }
}
