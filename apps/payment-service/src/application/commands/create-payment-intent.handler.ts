import type { PaymentIntentDto } from "@meridian/contracts";
import { CLOCK, type Clock, ConflictError, DomainError, Money } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Payment, PaymentIds } from "../../domain";
import { toIntentDto } from "../dto";
import { ClientSecrets, PaymentProviders, ProviderRejectedError, UnitOfWork } from "../ports";
import { CreatePaymentIntentCommand } from "./create-payment-intent.command";

/**
 * Idempotent per orderId: the order-scoped lock serialises concurrent requests, a replay returns the same payment
 * (and the same client secrets). The provider transaction (Paddle transaction, Stripe PaymentIntent) is created outside
 * the database transaction and attached after; Stripe's own idempotency key makes a racing duplicate return the same intent.
 */
@CommandHandler(CreatePaymentIntentCommand)
export class CreatePaymentIntentHandler implements ICommandHandler<CreatePaymentIntentCommand, PaymentIntentDto> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly providers: PaymentProviders,
    private readonly secrets: ClientSecrets,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ request }: CreatePaymentIntentCommand): Promise<PaymentIntentDto> {
    const amount = Money.cents(request.amountCents, request.currency);
    const active = this.providers.active();
    let payment = await this.uow.run(async (tx) => {
      const existing = await tx.payments.lock({ orderId: request.orderId });
      if (existing) {
        if (!existing.matchesCharge(amount)) {
          throw new ConflictError("A payment for this order already exists with a different amount.", { orderId: request.orderId });
        }
        return existing;
      }
      const id = PaymentIds.payment();
      const created = Payment.open({
        id,
        orderId: request.orderId,
        orderNumber: request.orderNumber,
        transactionId: PaymentIds.transaction(),
        provider: active.id,
        amount,
        clientSecretHash: active.supportsSandboxCompletion ? this.secrets.hash(this.secrets.issue(id)) : null,
        now: this.clock.now(),
      });
      await tx.payments.insert(created);
      return created;
    });

    const provider = this.providers.get(payment.provider);
    let providerClientSecret: string | null = null;
    if (payment.provider !== "local-sandbox" && payment.status === "pending") {
      if (!payment.providerTransactionId) {
        if (!provider) throw new DomainError("UPSTREAM_UNAVAILABLE", "The payment provider for this order is not available right now.");
        const created = await this.guard(
          provider.createTransaction({
            paymentId: payment.id,
            orderId: payment.orderId,
            orderNumber: request.orderNumber,
            amountCents: payment.amount.cents,
            currency: payment.amount.currency,
            customer: request.customer,
            lines: request.lines,
          }),
        );
        if (created) {
          providerClientSecret = created.clientSecret ?? null;
          payment = await this.uow.run(async (tx) => {
            const locked = await tx.payments.lock({ id: payment.id });
            if (!locked) throw new DomainError("NOT_FOUND", "Payment disappeared while creating the intent.");
            // A concurrent request may have attached its own transaction first; the first one wins.
            if (!locked.providerTransactionId) {
              locked.attachProviderTransaction(created.providerTransactionId, this.clock.now());
              await tx.payments.save(locked);
            }
            return locked;
          });
          if (payment.providerTransactionId !== created.providerTransactionId) providerClientSecret = null;
        }
      }
      // Replays (and the loser of a race) fetch the browser secret of the transaction that was kept.
      if (!providerClientSecret && payment.providerTransactionId && provider?.transactionClientSecret) {
        providerClientSecret = await this.guard(provider.transactionClientSecret(payment.providerTransactionId));
      }
    }
    return toIntentDto(payment, {
      clientSecret: payment.clientSecretHash ? this.secrets.issue(payment.id) : null,
      clientToken: provider?.clientToken() ?? null,
      providerClientSecret,
    });
  }

  /** A provider refusal while opening the payment means payments are unavailable for this order right now. */
  private guard<T>(call: Promise<T>): Promise<T> {
    return call.catch((error: unknown) => {
      if (error instanceof ProviderRejectedError) {
        throw new DomainError("UPSTREAM_UNAVAILABLE", "The payment provider could not create this payment.", { provider: error.provider, providerCode: error.providerCode });
      }
      throw error;
    });
  }
}
