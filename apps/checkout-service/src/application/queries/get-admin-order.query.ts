import type { AdminOrderDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";

export class GetAdminOrderQuery extends Query<AdminOrderDto> {
  constructor(readonly orderId: string) {
    super();
  }
}
