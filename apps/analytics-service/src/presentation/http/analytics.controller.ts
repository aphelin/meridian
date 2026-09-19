import type { AnalyticsOverviewDto, TopProductDto } from "@meridian/contracts";
import { AdminOnly, parseWith } from "@meridian/nest-kit";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { GetAnalyticsOverviewQuery, GetTopProductsQuery } from "../../application/queries";
import { overviewQuerySchema, topProductsQuerySchema } from "./schemas";

@Controller("analytics")
@AdminOnly()
export class AnalyticsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("overview")
  overview(@Query() query: unknown): Promise<AnalyticsOverviewDto> {
    const { days } = parseWith(overviewQuerySchema, query);
    return this.queryBus.execute(new GetAnalyticsOverviewQuery(days));
  }

  @Get("top-products")
  topProducts(@Query() query: unknown): Promise<TopProductDto[]> {
    const { days, limit } = parseWith(topProductsQuerySchema, query);
    return this.queryBus.execute(new GetTopProductsQuery(days, limit));
  }
}
