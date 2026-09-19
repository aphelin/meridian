import type { CartDto, CartLineInput } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class ReplaceCartItemsCommand extends Command<CartDto> {
  constructor(
    readonly userId: string | null,
    readonly cartId: string | null,
    readonly lines: CartLineInput[],
  ) {
    super();
  }
}
