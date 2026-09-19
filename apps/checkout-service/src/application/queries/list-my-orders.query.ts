import type { OrderSummaryDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";

export class ListMyOrdersQuery extends Query<OrderSummaryDto[]> {
  constructor(readonly userId: string) {
    super();
  }
}
