import type { AdminOrderListDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";
import type { AdminOrderFilter } from "../ports";

export class ListAdminOrdersQuery extends Query<AdminOrderListDto> {
  constructor(readonly filter: AdminOrderFilter) {
    super();
  }
}
