import type { OrderSummaryDto } from "@meridian/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { OrderReadModel } from "../ports";
import { ListMyOrdersQuery } from "./list-my-orders.query";

export const MY_ORDERS_LIMIT = 100;

@QueryHandler(ListMyOrdersQuery)
export class ListMyOrdersHandler implements IQueryHandler<ListMyOrdersQuery, OrderSummaryDto[]> {
  constructor(private readonly readModel: OrderReadModel) {}

  execute(query: ListMyOrdersQuery): Promise<OrderSummaryDto[]> {
    return this.readModel.listForUser(query.userId, MY_ORDERS_LIMIT);
  }
}
