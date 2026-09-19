import type { CustomerListDto } from "@meridian/contracts";
import { AdminOnly, parseWith } from "@meridian/nest-kit";
import { Controller, Get, Inject, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { ListCustomersQuery } from "../../application";
import { CustomerListQuery } from "./schemas";

@Controller("admin/customers")
@AdminOnly()
export class AdminCustomersController {
  constructor(@Inject(QueryBus) private readonly queryBus: QueryBus) {}

  @Get()
  list(@Query() raw: Record<string, unknown>): Promise<CustomerListDto> {
    const query = parseWith(CustomerListQuery, raw);
    return this.queryBus.execute(new ListCustomersQuery(query.q ?? null, query.cursor ?? null, query.limit ?? ListCustomersQuery.DEFAULT_LIMIT));
  }
}
