import type { CartDto } from "@meridian/contracts";
import { Authenticated, CurrentUser, OptionalAuth, type Principal, ZodBody } from "@meridian/nest-kit";
import { Controller, Delete, Get, Headers, HttpCode, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { z } from "zod";
import { ClearCartCommand, MergeCartCommand, ReplaceCartItemsCommand } from "../../application/commands";
import { GetCartQuery } from "../../application/queries";
import { parseCartId, replaceCartItemsSchema } from "./schemas";

@Controller("cart")
export class CartController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @OptionalAuth()
  get(@CurrentUser() user: Principal | null, @Headers("x-cart-id") cartId?: string): Promise<CartDto> {
    return this.queryBus.execute(new GetCartQuery(user?.sub ?? null, parseCartId(cartId)));
  }

  @Put("items")
  @OptionalAuth()
  @HttpCode(200)
  replaceItems(
    @CurrentUser() user: Principal | null,
    @ZodBody(replaceCartItemsSchema) body: z.infer<typeof replaceCartItemsSchema>,
    @Headers("x-cart-id") cartId?: string,
  ): Promise<CartDto> {
    return this.commandBus.execute(new ReplaceCartItemsCommand(user?.sub ?? null, parseCartId(cartId), body.lines));
  }

  @Post("merge")
  @Authenticated()
  @HttpCode(200)
  merge(@CurrentUser() user: Principal, @Headers("x-cart-id") guestCartId?: string): Promise<CartDto> {
    return this.commandBus.execute(new MergeCartCommand(user.sub, parseCartId(guestCartId)));
  }

  @Delete()
  @OptionalAuth()
  @HttpCode(204)
  async clear(@CurrentUser() user: Principal | null, @Headers("x-cart-id") cartId?: string): Promise<void> {
    await this.commandBus.execute(new ClearCartCommand(user?.sub ?? null, parseCartId(cartId)));
  }
}
