import type { WishlistDto } from "@meridian/contracts";
import { Authenticated, CurrentUser, parseWith, type Principal, ZodBody } from "@meridian/nest-kit";
import { Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { z } from "zod";
import { AddToWishlistCommand, RemoveFromWishlistCommand, ReplaceWishlistCommand } from "../../application/commands/wishlist.commands";
import { GetWishlistQuery } from "../../application/queries/engagement.queries";
import { slugSchema, wishlistAddSchema, wishlistReplaceSchema } from "./schemas";

/** The signed-in shopper's wishlist, by product slug. */
@Controller("wishlist")
@Authenticated()
export class WishlistController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  get(@CurrentUser() user: Principal): Promise<WishlistDto> {
    return this.queryBus.execute(new GetWishlistQuery(user.sub));
  }

  @Put()
  replace(@CurrentUser() user: Principal, @ZodBody(wishlistReplaceSchema) body: z.output<typeof wishlistReplaceSchema>): Promise<WishlistDto> {
    return this.commandBus.execute(new ReplaceWishlistCommand(user.sub, body.slugs));
  }

  @Post()
  @HttpCode(200)
  add(@CurrentUser() user: Principal, @ZodBody(wishlistAddSchema) body: z.output<typeof wishlistAddSchema>): Promise<WishlistDto> {
    return this.commandBus.execute(new AddToWishlistCommand(user.sub, body.slug));
  }

  @Delete(":slug")
  remove(@CurrentUser() user: Principal, @Param("slug") slug: string): Promise<WishlistDto> {
    return this.commandBus.execute(new RemoveFromWishlistCommand(user.sub, parseWith(slugSchema, slug)));
  }
}
