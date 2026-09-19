import type { OrderDto } from "@meridian/contracts";
import { CLOCK, type Clock, DomainError, NotFoundError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { OrderRepository, ShippingPolicies } from "../../domain";
import { toOrderDto } from "../mappers/order-dto.mapper";
import { OrderAccessTokens } from "../ports";
import { canViewOrder } from "../services";
import { GetOrderQuery } from "./get-order.query";

@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery, OrderDto> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly tokens: OrderAccessTokens,
    private readonly shipping: ShippingPolicies,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetOrderQuery): Promise<OrderDto> {
    const order = await this.orders.findById(query.orderId);
    if (!order) throw new NotFoundError("Order not found.");
    if (!canViewOrder(order, query.viewer, query.accessToken, this.tokens)) throw new DomainError("FORBIDDEN", "You do not have access to this order.");
    return toOrderDto(order, this.shipping, this.clock.now());
  }
}
