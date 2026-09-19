import type { OrderDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";
import type { OrderViewer } from "../services/order-access";

export type { OrderViewer };

export class GetOrderQuery extends Query<OrderDto> {
  constructor(
    readonly orderId: string,
    readonly viewer: OrderViewer | null,
    /** Guest capability token from `x-order-access`. */
    readonly accessToken: string | null,
  ) {
    super();
  }
}
