import type { InvoiceLinkDto, OrderDto, ReturnDto } from "@meridian/contracts";
import { CurrentUser, OptionalAuth, parseWith, type Principal, ZodBody } from "@meridian/nest-kit";
import { Controller, Get, Headers, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { z } from "zod";
import { CancelOrderCommand, RequestReturnCommand } from "../../application/commands";
import { GetInvoiceLinkQuery } from "../../application/queries";
import type { OrderViewer } from "../../application/services";
import { headerValue, returnRequestSchema, routeIdSchema } from "./schemas";

const viewerOf = (user: Principal | null): OrderViewer | null => (user ? { userId: user.sub, role: user.role ?? null } : null);

/** Shopper actions on one order: the signed-in owner, or a guest holding the order's `x-order-access` token. */
@Controller("orders/:id")
export class OrderOperationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post("cancel")
  @OptionalAuth()
  @HttpCode(200)
  cancel(@Param("id") id: string, @CurrentUser() user: Principal | null, @Headers("x-order-access") access?: string | string[]): Promise<OrderDto> {
    return this.commandBus.execute(new CancelOrderCommand(parseWith(routeIdSchema, id), viewerOf(user), headerValue(access)));
  }

  @Post("returns")
  @OptionalAuth()
  @HttpCode(201)
  requestReturn(
    @Param("id") id: string,
    @CurrentUser() user: Principal | null,
    @ZodBody(returnRequestSchema) body: z.infer<typeof returnRequestSchema>,
    @Headers("x-order-access") access?: string | string[],
  ): Promise<ReturnDto> {
    return this.commandBus.execute(new RequestReturnCommand(parseWith(routeIdSchema, id), viewerOf(user), headerValue(access), body.lines, body.reason));
  }

  @Get("invoice")
  @OptionalAuth()
  invoice(@Param("id") id: string, @CurrentUser() user: Principal | null, @Headers("x-order-access") access?: string | string[]): Promise<InvoiceLinkDto> {
    return this.queryBus.execute(new GetInvoiceLinkQuery(parseWith(routeIdSchema, id), viewerOf(user), headerValue(access)));
  }
}
