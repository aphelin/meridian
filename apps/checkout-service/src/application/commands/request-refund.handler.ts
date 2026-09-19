import type { RefundDto } from "@meridian/contracts";
import { CLOCK, type Clock, NotFoundError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { AuditLog, auditEntry, OrderRepository } from "../../domain";
import { toRefundDto } from "../mappers/order-dto.mapper";
import { MessageOutbox, UnitOfWork } from "../ports";
import { retryOnConflict } from "../services";
import { refundCommandPayload } from "./refund-payload";
import { RequestRefundCommand } from "./request-refund.command";

/**
 * Admin refund: the Order checks 0 < amount ≤ paid − refunded − pending and opens a pending refund; `payment.refund`
 * and the audit row are written in the same transaction. The outcome arrives later as `checkout.record-refund`.
 */
@CommandHandler(RequestRefundCommand)
export class RequestRefundHandler implements ICommandHandler<RequestRefundCommand, RefundDto> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly audit: AuditLog,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(command: RequestRefundCommand): Promise<RefundDto> {
    return retryOnConflict(() =>
      this.uow.run(async (tx) => {
        const order = await this.orders.findById(command.orderId, tx);
        if (!order) throw new NotFoundError("Order not found.");
        const now = this.clock.now();
        const refund = order.requestRefund({ amountCents: command.amountCents, reason: command.reason }, now);
        await this.orders.save(order, tx);
        await this.outbox.command(tx, "payment.refund", refundCommandPayload(order.id, refund), { type: "Order", id: order.id });
        await this.audit.append(
          auditEntry({ action: "order.refund", actorId: command.actorId, subjectType: "order", subjectId: order.id, at: now, meta: { refundId: refund.id, amountCents: refund.amountCents, reason: refund.reason } }),
          tx,
        );
        return toRefundDto(refund);
      }),
    );
  }
}
