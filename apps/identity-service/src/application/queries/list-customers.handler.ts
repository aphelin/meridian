import type { CustomerListDto } from "@meridian/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { IdentityReadModel } from "../ports";
import { ListCustomersQuery } from "./list-customers.query";

/** Newest customers first, optional search over email and name, opaque cursor pagination. */
@QueryHandler(ListCustomersQuery)
export class ListCustomersHandler implements IQueryHandler<ListCustomersQuery, CustomerListDto> {
  constructor(@Inject(IdentityReadModel) private readonly read: IdentityReadModel) {}

  execute(query: ListCustomersQuery): Promise<CustomerListDto> {
    const limit = Math.min(Math.max(Math.trunc(query.limit) || ListCustomersQuery.DEFAULT_LIMIT, 1), ListCustomersQuery.MAX_LIMIT);
    const q = query.q?.trim() || null;
    return this.read.customers({ q, cursor: query.cursor || null, limit });
  }
}
