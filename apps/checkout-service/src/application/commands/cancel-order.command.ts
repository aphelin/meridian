import type { OrderDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";
import type { OrderViewer } from "../services/order-access";

/** Shopper (owner or guest link) cancels an order; an admin may cancel too (reason `admin`). */
export class CancelOrderCommand extends Command<OrderDto> {
  constructor(
    readonly orderId: string,
    readonly viewer: OrderViewer | null,
    readonly accessToken: string | null,
  ) {
    super();
  }
}
