import type { AdminOrderDto, AdminOrderListDto, OrderDto, RefundDto } from "@meridian/contracts";
import { AdminOnly, CurrentUser, parseWith, type Principal, ZodBody } from "@meridian/nest-kit";
import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { z } from "zod";
import { ExpireOrdersCommand, RequestRefundCommand, TransitionOrderCommand } from "../../application/commands";
import { GetAdminOrderQuery, ListAdminOrdersQuery } from "../../application/queries";
import { adminOrdersQuerySchema, expireOrdersSchema, refundRequestSchema, routeIdSchema, transitionSchema } from "./schemas";

@Controller("admin/orders")
@AdminOnly()
export class AdminOrdersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@Query() query: Record<string, unknown>): Promise<AdminOrderListDto> {
    return this.queryBus.execute(new ListAdminOrdersQuery(parseWith(adminOrdersQuerySchema, query)));
  }

  /** Runs the expiry sweep now (e.g. `{ olderThanSeconds: 0 }` in demos and tests). */
  @Post("expire")
  @HttpCode(200)
  expire(@ZodBody(expireOrdersSchema) body: z.infer<typeof expireOrdersSchema>): Promise<{ expired: number }> {
    return this.commandBus.execute(new ExpireOrdersCommand(body.olderThanSeconds));
  }

  @Get(":id")
  detail(@Param("id") id: string): Promise<AdminOrderDto> {
    return this.queryBus.execute(new GetAdminOrderQuery(parseWith(routeIdSchema, id)));
  }

  @Post(":id/transition")
  @HttpCode(200)
  transition(@Param("id") id: string, @CurrentUser() admin: Principal, @ZodBody(transitionSchema) body: z.infer<typeof transitionSchema>): Promise<OrderDto> {
    return this.commandBus.execute(new TransitionOrderCommand(parseWith(routeIdSchema, id), admin.sub, body));
  }

  @Post(":id/refunds")
  @HttpCode(202)
  refund(@Param("id") id: string, @CurrentUser() admin: Principal, @ZodBody(refundRequestSchema) body: z.infer<typeof refundRequestSchema>): Promise<RefundDto> {
    return this.commandBus.execute(new RequestRefundCommand(parseWith(routeIdSchema, id), admin.sub, body.amountCents, body.reason));
  }
}
