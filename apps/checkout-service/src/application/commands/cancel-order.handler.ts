import type { CancellationReason, OrderDto } from "@meridian/contracts";
import { CLOCK, type Clock, DomainError, NotFoundError } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { AuditLog, auditEntry, CouponRepository, OrderRepository, ShippingPolicies } from "../../domain";
import { toOrderDto } from "../mappers/order-dto.mapper";
import { MessageOutbox, OrderAccessTokens, UnitOfWork } from "../ports";
import { actsAsCustomer, isAdmin, retryOnConflict } from "../services";
import { CancelOrderCommand } from "./cancel-order.command";
import { refundCommandPayload } from "./refund-payload";

const log = createLogger("CancelOrder");

/**
 * Cancels an order in one transaction:
 *   - placed (unpaid): OrderCancelled + `inventory.release-reservation` (the hold is given back);
 *   - paid or fulfilling: OrderCancelled {refundRequired} + `payment.refund` for everything still refundable
 *     (returnId null) + `inventory.restock` with every line, because stock was committed at payment;
 *   - anything later: ORDER_NOT_CANCELLABLE.
 * The coupon redemption is given back either way. The version guard makes a racing payment confirmation either win
 * (the retry then takes the paid path) or lose (it voids its payment).
 */
@CommandHandler(CancelOrderCommand)
export class CancelOrderHandler implements ICommandHandler<CancelOrderCommand, OrderDto> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly coupons: CouponRepository,
    private readonly audit: AuditLog,
    private readonly tokens: OrderAccessTokens,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
    private readonly shipping: ShippingPolicies,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ orderId, viewer, accessToken }: CancelOrderCommand): Promise<OrderDto> {
    const order = await retryOnConflict(() =>
      this.uow.run(async (tx) => {
        const order = await this.orders.findById(orderId, tx);
        if (!order) throw new NotFoundError("Order not found.");
        const asCustomer = actsAsCustomer(order, viewer, accessToken, this.tokens);
        if (!asCustomer && !isAdmin(viewer)) throw new DomainError("FORBIDDEN", "You do not have access to this order.");
        const reason: CancellationReason = asCustomer ? "customer" : "admin";
        const now = this.clock.now();
        const outcome = order.cancel(reason, now);
        await this.orders.save(order, tx);
        await this.coupons.releaseRedemption(order.id, tx);
        await this.outbox.events(tx, order.pullEvents());
        const aggregate = { type: "Order", id: order.id };
        if (!outcome.wasPaid) {
          await this.outbox.command(tx, "inventory.release-reservation", { orderId: order.id, reason: "cancelled" }, aggregate);
          // An unpaid order may already have a provider transaction (a Stripe PaymentIntent): cancel it so it can't be paid.
          const { transactionId } = order.payment;
          if (transactionId) await this.outbox.command(tx, "payment.void", { orderId: order.id, transactionId, reason: `Order cancelled (${reason}) before payment` }, aggregate);
        } else {
          if (outcome.refund) await this.outbox.command(tx, "payment.refund", refundCommandPayload(order.id, outcome.refund), aggregate);
          if (outcome.restockLines.length) await this.outbox.command(tx, "inventory.restock", { orderId: order.id, returnId: null, lines: outcome.restockLines }, aggregate);
        }
        if (reason === "admin" && viewer) {
          await this.audit.append(
            auditEntry({ action: "order.cancel", actorId: viewer.userId, subjectType: "order", subjectId: order.id, at: now, meta: { wasPaid: outcome.wasPaid, refundCents: outcome.refund?.amountCents ?? 0 } }),
            tx,
          );
        }
        log.info("order cancelled", { orderId: order.id, reason, wasPaid: outcome.wasPaid, refundCents: outcome.refund?.amountCents ?? 0 });
        return order;
      }),
    );
    return toOrderDto(order, this.shipping, this.clock.now());
  }
}
