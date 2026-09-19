import type { AdminOrderDto } from "@meridian/contracts";
import { CLOCK, type Clock, NotFoundError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { AuditLog, OrderRepository, ShippingPolicies } from "../../domain";
import { toAdminOrderDto } from "../mappers/order-dto.mapper";
import { PaymentSummaries } from "../ports";
import { GetAdminOrderQuery } from "./get-admin-order.query";

/** Order detail for admins: the order, payment-service's summary (null when it is unavailable) and the audit trail. */
@QueryHandler(GetAdminOrderQuery)
export class GetAdminOrderHandler implements IQueryHandler<GetAdminOrderQuery, AdminOrderDto> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly payments: PaymentSummaries,
    private readonly audit: AuditLog,
    private readonly shipping: ShippingPolicies,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ orderId }: GetAdminOrderQuery): Promise<AdminOrderDto> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError("Order not found.");
    const [payment, audit] = await Promise.all([this.payments.forOrder(order.id), this.audit.forOrder(order.id)]);
    return toAdminOrderDto(order, this.shipping, this.clock.now(), payment, audit);
  }
}
