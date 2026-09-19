import type { PublicStockDto } from "@meridian/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { GetPublicStockQuery, ListPublicStockQuery } from "../../application/queries";

/** Public availability for the storefront: sku and available only. */
@Controller("stock")
export class StockController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  list(): Promise<PublicStockDto[]> {
    return this.queryBus.execute(new ListPublicStockQuery());
  }

  @Get(":sku")
  get(@Param("sku") sku: string): Promise<PublicStockDto> {
    return this.queryBus.execute(new GetPublicStockQuery(sku));
  }
}
