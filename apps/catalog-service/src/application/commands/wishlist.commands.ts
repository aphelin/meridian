import type { WishlistDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class ReplaceWishlistCommand extends Command<WishlistDto> {
  constructor(
    readonly userId: string,
    readonly slugs: string[],
  ) {
    super();
  }
}

export class AddToWishlistCommand extends Command<WishlistDto> {
  constructor(
    readonly userId: string,
    readonly slug: string,
  ) {
    super();
  }
}

export class RemoveFromWishlistCommand extends Command<WishlistDto> {
  constructor(
    readonly userId: string,
    readonly slug: string,
  ) {
    super();
  }
}
