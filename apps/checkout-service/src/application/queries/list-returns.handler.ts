import type { Page } from "@meridian/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { type AdminReturnDto, OrderReadModel } from "../ports";
import { ListReturnsQuery } from "./list-returns.query";

/** Admin return queue, newest first, with the order number and customer. */
@QueryHandler(ListReturnsQuery)
export class ListReturnsHandler implements IQueryHandler<ListReturnsQuery, Page<AdminReturnDto>> {
  constructor(private readonly readModel: OrderReadModel) {}

  execute({ filter }: ListReturnsQuery): Promise<Page<AdminReturnDto>> {
    return this.readModel.listReturns(filter);
  }
}
