import { CLOCK, type Clock, NotFoundError } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { OrderRepository } from "../../domain";
import { MessageOutbox, UnitOfWork } from "../ports";
import { retryOnConflict } from "../services";
import { RecordRefundOutcomeCommand, type RefundOutcomeResult } from "./record-refund-outcome.command";

const log = createLogger("RecordRefundOutcome");

/**
 * `checkout.record-refund` from payment-service. Idempotent per refundId (the Order ignores an outcome for a refund
 * that is already settled), so redeliveries and duplicates raise exactly one OrderRefunded. A success adds to
 * refundedCents and moves the order to partially_refunded/refunded (and the return to refunded); a failure is kept
 * on the order as a failed refund and no longer counts as pending.
 */
@CommandHandler(RecordRefundOutcomeCommand)
export class RecordRefundOutcomeHandler implements ICommandHandler<RecordRefundOutcomeCommand, RefundOutcomeResult> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute({ payload }: RecordRefundOutcomeCommand): Promise<RefundOutcomeResult> {
    return retryOnConflict(() =>
      this.uow.run(async (tx) => {
        const order = await this.orders.findById(payload.orderId, tx);
        if (!order) throw new NotFoundError(`Order ${payload.orderId} not found`, { orderId: payload.orderId });
        if (!order.isPaid) {
          // e.g. a settled payment voided for an order that expired first: nothing was ever charged on this order.
          log.warn("refund outcome for an order that was never paid; ignored", { orderId: payload.orderId, refundId: payload.refundId, status: payload.status });
          return "ignored";
        }
        if (!order.recordRefundOutcome(payload, this.clock.now())) return "duplicate";
        await this.orders.save(order, tx);
        await this.outbox.events(tx, order.pullEvents());
        log.info("refund outcome recorded", { orderId: order.id, refundId: payload.refundId, status: payload.status, amountCents: payload.amountCents });
        return "recorded";
      }),
    );
  }
}
