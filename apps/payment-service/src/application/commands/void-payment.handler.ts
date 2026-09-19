import { createLogger } from "@meridian/nest-kit";
import { CLOCK, type Clock, DomainError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { outboundMessages } from "../services/outbound-messages";
import { RefundDispatcher } from "../services/refund-dispatcher";
import { PaymentProviders, ProviderRejectedError, UnitOfWork } from "../ports";
import { VoidPaymentCommand, type VoidPaymentResult } from "./void-payment.command";

const log = createLogger("VoidPayment");

/**
 * payment.void (order no longer payable): PaymentVoided; captured money is refunded in full through the provider;
 * an uncaptured Paddle transaction is canceled so it cannot be paid any more. Safe to redeliver.
 */
@CommandHandler(VoidPaymentCommand)
export class VoidPaymentHandler implements ICommandHandler<VoidPaymentCommand, VoidPaymentResult> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly providers: PaymentProviders,
    private readonly dispatcher: RefundDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ request }: VoidPaymentCommand): Promise<VoidPaymentResult> {
    const { orderId, transactionId, reason } = request;
    const result = await this.uow.run(async (tx) => {
      const payment = await tx.payments.lock({ transactionId });
      if (!payment) return null;
      if (payment.orderId !== orderId) throw new DomainError("VALIDATION_FAILED", "The transaction does not belong to this order.", { orderId, transactionId });
      const changed = payment.void(reason, this.clock.now());
      if (changed) {
        await tx.payments.save(payment);
        await tx.write(outboundMessages(payment.pullEvents()));
      }
      return { payment, changed };
    });
    if (!result) {
      log.warn("void requested for an unknown transaction", { orderId, transactionId });
      return { outcome: "unknown-payment" };
    }
    const { payment, changed } = result;
    if (payment.status === "voided" && !payment.isCaptured && payment.providerTransactionId) {
      const provider = this.providers.get(payment.provider);
      try {
        await provider?.cancelTransaction(payment.providerTransactionId);
      } catch (error) {
        if (!(error instanceof ProviderRejectedError)) throw error;
        log.info("provider transaction could not be canceled (already closed)", { paymentId: payment.id, providerCode: error.providerCode });
      }
    }
    await this.dispatcher.dispatchPending(payment.id);
    return { outcome: changed ? "voided" : "already-closed" };
  }
}
