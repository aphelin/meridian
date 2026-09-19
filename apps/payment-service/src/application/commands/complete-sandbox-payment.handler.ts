import { CLOCK, type Clock, DomainError, NotFoundError } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { outboundMessages } from "../services/outbound-messages";
import { ClientSecrets, PaymentProviders, ProviderRejectedError, UnitOfWork } from "../ports";
import { CompleteSandboxPaymentCommand, type SandboxCompletionResult } from "./complete-sandbox-payment.command";

const log = createLogger("SandboxCompletion");

/**
 * Sandbox "pay" button: the client secret proves the caller is the session that placed the order.
 * - Local sandbox: Payment.succeed + PaymentSucceeded + checkout.confirm-payment in one transaction; replays change nothing.
 * - Stripe test mode: the PaymentIntent is confirmed with the pm_card_visa test card (outside the database transaction);
 *   the signed payment_intent.succeeded webhook then settles the payment exactly like a Payment Element payment.
 */
@CommandHandler(CompleteSandboxPaymentCommand)
export class CompleteSandboxPaymentHandler implements ICommandHandler<CompleteSandboxPaymentCommand, SandboxCompletionResult> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly providers: PaymentProviders,
    private readonly secrets: ClientSecrets,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ transactionId, clientSecret }: CompleteSandboxPaymentCommand): Promise<SandboxCompletionResult> {
    if (!this.providers.active().supportsSandboxCompletion) throw new NotFoundError("Sandbox completion is not available.");
    const outcome = await this.uow.run(async (tx) => {
      const payment = await tx.payments.lock({ transactionId });
      const provider = payment ? this.providers.get(payment.provider) : null;
      if (!payment || !provider?.supportsSandboxCompletion) throw new NotFoundError("Unknown transaction.");
      if (!payment.clientSecretHash || !this.secrets.matches(clientSecret, payment.clientSecretHash)) {
        throw new DomainError("FORBIDDEN", "This payment session is not valid.");
      }
      if (provider.confirmSandboxPayment) {
        if (payment.status !== "pending" && !payment.isCaptured) {
          throw new DomainError("ORDER_NOT_PAYABLE", "This order can no longer be paid, so nothing was charged. Please place it again.", { status: payment.status });
        }
        return { status: payment.status, confirm: payment.status === "pending" ? { provider, paymentId: payment.id, orderId: payment.orderId, providerTransactionId: payment.providerTransactionId } : null };
      }
      if (payment.succeed(this.clock.now())) {
        await tx.payments.save(payment);
        await tx.write(outboundMessages(payment.pullEvents()));
      }
      return { status: payment.status, confirm: null };
    });

    const confirm = outcome.confirm;
    if (confirm?.provider.confirmSandboxPayment) {
      if (!confirm.providerTransactionId) throw new DomainError("UPSTREAM_UNAVAILABLE", "The payment is not ready yet. Please try again shortly.");
      try {
        await confirm.provider.confirmSandboxPayment({ paymentId: confirm.paymentId, orderId: confirm.orderId, providerTransactionId: confirm.providerTransactionId });
      } catch (error) {
        if (!(error instanceof ProviderRejectedError)) throw error;
        log.warn("provider refused the sandbox confirmation", { paymentId: confirm.paymentId, provider: error.provider, providerCode: error.providerCode });
        throw new DomainError("CONFLICT", "The provider refused the test payment. Open the order to check its status.", { providerCode: error.providerCode });
      }
      log.info("sandbox payment confirmed at the provider; awaiting its webhook", { paymentId: confirm.paymentId, provider: confirm.provider.id });
    }
    return { status: outcome.status };
  }
}
