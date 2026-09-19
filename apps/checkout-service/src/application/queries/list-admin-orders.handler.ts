import type { AdminOrderListDto } from "@meridian/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { OrderReadModel } from "../ports";
import { ListAdminOrdersQuery } from "./list-admin-orders.query";

@QueryHandler(ListAdminOrdersQuery)
export class ListAdminOrdersHandler implements IQueryHandler<ListAdminOrdersQuery, AdminOrderListDto> {
  constructor(private readonly readModel: OrderReadModel) {}

  execute({ filter }: ListAdminOrdersQuery): Promise<AdminOrderListDto> {
    return this.readModel.listForAdmin(filter);
  }
}
