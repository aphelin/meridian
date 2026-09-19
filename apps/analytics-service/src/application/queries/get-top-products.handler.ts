import type { TopProductDto } from "@meridian/contracts";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { rankTopProducts, ReportingWindow } from "../../domain";
import { AnalyticsReadModel } from "../ports";
import { GetTopProductsQuery } from "./get-top-products.query";

@QueryHandler(GetTopProductsQuery)
export class GetTopProductsHandler implements IQueryHandler<GetTopProductsQuery, TopProductDto[]> {
  constructor(
    private readonly readModel: AnalyticsReadModel,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ days, limit }: GetTopProductsQuery): Promise<TopProductDto[]> {
    const window = ReportingWindow.lastDays(days, this.clock.now());
    const rows = await this.readModel.productSales(window.from.value, window.to.value);
    return rankTopProducts(rows, limit);
  }
}
