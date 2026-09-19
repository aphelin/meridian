import type { OrderDto } from "@meridian/contracts";
import { CLOCK, type Clock, NotFoundError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { AuditLog, auditEntry, type FulfilmentStep, OrderRepository, ShippingPolicies } from "../../domain";
import { toOrderDto } from "../mappers/order-dto.mapper";
import { MessageOutbox, UnitOfWork } from "../ports";
import { retryOnConflict } from "../services";
import { TransitionOrderCommand } from "./transition-order.command";

/** Admin fulfilment: paid → fulfilling → shipped (tracking) → delivered, with the event and an audit row in one transaction. */
@CommandHandler(TransitionOrderCommand)
export class TransitionOrderHandler implements ICommandHandler<TransitionOrderCommand, OrderDto> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly audit: AuditLog,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
    private readonly shipping: ShippingPolicies,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ orderId, actorId, request }: TransitionOrderCommand): Promise<OrderDto> {
    const order = await retryOnConflict(() =>
      this.uow.run(async (tx) => {
        const order = await this.orders.findById(orderId, tx);
        if (!order) throw new NotFoundError("Order not found.");
        const now = this.clock.now();
        const step: FulfilmentStep = request.status === "shipped" ? { status: "shipped", carrier: request.carrier, trackingNumber: request.trackingNumber } : { status: request.status };
        const { from, to } = order.advanceFulfilment(step, now);
        await this.orders.save(order, tx);
        await this.outbox.events(tx, order.pullEvents());
        const fulfillment = order.snapshot().fulfillment;
        await this.audit.append(
          auditEntry({
            action: "order.transition",
            actorId,
            subjectType: "order",
            subjectId: order.id,
            at: now,
            meta: to === "shipped" ? { from, to, carrier: fulfillment.carrier, trackingNumber: fulfillment.trackingNumber, trackingUrl: fulfillment.trackingUrl } : { from, to },
          }),
          tx,
        );
        return order;
      }),
    );
    return toOrderDto(order, this.shipping, this.clock.now());
  }
}
