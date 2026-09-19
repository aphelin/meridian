import type { AdminStockDto, StockMovementDto } from "@meridian/contracts";
import { AdminOnly, CurrentUser, parseWith, ZodBody, type Principal } from "@meridian/nest-kit";
import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";
import { AdjustStockCommand } from "../../application/commands";
import { ListAdminStockQuery, ListStockMovementsQuery } from "../../application/queries";
import { adjustStockSchema, movementsQuerySchema } from "./schemas";

@Controller("admin/stock")
@AdminOnly()
export class AdminStockController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(): Promise<AdminStockDto[]> {
    return this.queryBus.execute(new ListAdminStockQuery());
  }

  @Post("adjust")
  @HttpCode(200)
  adjust(@ZodBody(adjustStockSchema) body: z.output<typeof adjustStockSchema>, @CurrentUser() user: Principal | null): Promise<AdminStockDto> {
    const adjustment = body.onHand !== undefined ? { onHand: body.onHand } : { delta: body.delta! };
    return this.commandBus.execute(new AdjustStockCommand(body.sku, adjustment, body.reason, user?.sub ?? null));
  }

  @Get(":sku/movements")
  movements(@Param("sku") sku: string, @Query() query: unknown): Promise<StockMovementDto[]> {
    const { limit } = parseWith(movementsQuerySchema, query);
    return this.queryBus.execute(new ListStockMovementsQuery(sku, limit));
  }
}
