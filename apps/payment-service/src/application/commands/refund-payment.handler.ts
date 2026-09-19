import { createLogger } from "@meridian/nest-kit";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { outboundMessages } from "../services/outbound-messages";
import { RefundDispatcher } from "../services/refund-dispatcher";
import { UnitOfWork } from "../ports";
import { RefundPaymentCommand, type RefundPaymentResult } from "./refund-payment.command";

const log = createLogger("RefundPayment");
export const UNKNOWN_ORDER_REFUND_CONSUMER = "payment.refund:unknown-order";

/**
 * payment.refund: record the refund on the aggregate (refundId applied once; impossible refunds become RefundFailed +
 * checkout.record-refund failed), then dispatch it to the provider. Redelivered commands resume a refund whose
 * provider call never completed.
 */
@CommandHandler(RefundPaymentCommand)
export class RefundPaymentHandler implements ICommandHandler<RefundPaymentCommand, RefundPaymentResult> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly dispatcher: RefundDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ request }: RefundPaymentCommand): Promise<RefundPaymentResult> {
    const { orderId, refundId, amountCents, reason } = request;
    const recorded = await this.uow.run(async (tx) => {
      const payment = await tx.payments.lock({ orderId });
      if (!payment) {
        if (await tx.claim(UNKNOWN_ORDER_REFUND_CONSUMER, `${orderId}:${refundId}`)) {
          const failure = "No payment exists for this order.";
          await tx.write([
            { kind: "event", name: "RefundFailed", aggregate: { type: "Payment", id: orderId }, payload: { orderId, refundId, reason: failure } },
            { kind: "command", name: "checkout.record-refund", aggregate: null, payload: { orderId, refundId, amountCents, status: "failed", reason: failure } },
          ]);
        }
        return { outcome: "unknown-order" as const, paymentId: null };
      }
      const outcome = payment.requestRefund({ refundId, amountCents, reason, now: this.clock.now() });
      if (outcome !== "duplicate") {
        await tx.payments.save(payment);
        await tx.write(outboundMessages(payment.pullEvents()));
      }
      return { outcome, paymentId: payment.id };
    });
    if (recorded.outcome === "unknown-order") log.warn("refund requested for an order without payment", { orderId, refundId });
    if (recorded.paymentId && recorded.outcome !== "rejected") await this.dispatcher.dispatchPending(recorded.paymentId, refundId);
    return { outcome: recorded.outcome };
  }
}
