import type { Page, ReturnDto } from "@meridian/contracts";
import { AdminOnly, CurrentUser, parseWith, type Principal, ZodBody } from "@meridian/nest-kit";
import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { z } from "zod";
import { DecideReturnCommand } from "../../application/commands";
import type { AdminReturnDto } from "../../application/ports";
import { ListReturnsQuery } from "../../application/queries";
import { adminReturnsQuerySchema, returnDecisionSchema, routeIdSchema } from "./schemas";

@Controller("admin/returns")
@AdminOnly()
export class AdminReturnsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@Query() query: Record<string, unknown>): Promise<Page<AdminReturnDto>> {
    return this.queryBus.execute(new ListReturnsQuery(parseWith(adminReturnsQuerySchema, query)));
  }

  @Post(":id/decision")
  @HttpCode(200)
  decide(@Param("id") id: string, @CurrentUser() admin: Principal, @ZodBody(returnDecisionSchema) body: z.infer<typeof returnDecisionSchema>): Promise<ReturnDto> {
    return this.commandBus.execute(new DecideReturnCommand(parseWith(routeIdSchema, id), admin.sub, body));
  }
}
