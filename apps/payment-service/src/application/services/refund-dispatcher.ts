import { createLogger } from "@meridian/nest-kit";
import { CLOCK, type Clock, DomainError } from "@meridian/kernel";
import { Inject, Injectable } from "@nestjs/common";
import type { Payment } from "../../domain";
import { PAYMENT_SETTINGS, type PaymentSettings, PaymentProviders, ProviderRejectedError, UnitOfWork } from "../ports";
import { messagesFor } from "./outbound-messages";

const log = createLogger("RefundDispatcher");

/** Another worker is talking to the provider about this refund; the message is retried later (transient). */
export class RefundDispatchInProgressError extends Error {
  constructor(readonly refundId: string) {
    super(`Refund ${refundId} is being dispatched by another worker`);
    this.name = "RefundDispatchInProgressError";
  }
}

export interface DispatchReport {
  succeeded: string[];
  submitted: string[];
  failed: string[];
}

/**
 * Sends pending refunds to the provider without holding a database transaction open during the call:
 * claim a lease (tx) → provider call (timeout + breaker) → record the outcome (tx). Provider refusals are recorded
 * as failed refunds; transient failures release the lease and propagate, so RabbitMQ retries the command.
 */
@Injectable()
export class RefundDispatcher {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly providers: PaymentProviders,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PAYMENT_SETTINGS) private readonly settings: PaymentSettings,
  ) {}

  /** Dispatches the payment's refunds awaiting a provider call; `only` restricts it to one refundId. */
  async dispatchPending(paymentId: string, only?: string): Promise<DispatchReport> {
    const report: DispatchReport = { succeeded: [], submitted: [], failed: [] };
    const pending = await this.uow.run(async (tx) => (await tx.payments.lock({ id: paymentId }))?.refundsAwaitingDispatch() ?? []);
    for (const refundId of pending) {
      if (only === undefined || only === refundId) await this.dispatchOne(paymentId, refundId, report);
    }
    return report;
  }

  private async dispatchOne(paymentId: string, refundId: string, report: DispatchReport) {
    const claimed = await this.uow.run(async (tx) => {
      const payment = await tx.payments.lock({ id: paymentId });
      if (!payment) return null;
      const claim = payment.claimRefundDispatch(refundId, this.clock.now(), this.settings.refundDispatchLeaseMs);
      if (claim === "dispatch") await tx.payments.save(payment);
      return { claim, payment };
    });
    if (!claimed || claimed.claim === "settled" || claimed.claim === "submitted") return;
    if (claimed.claim === "in-flight") throw new RefundDispatchInProgressError(refundId);

    const { payment } = claimed;
    const refund = payment.refund(refundId)!;
    const provider = this.providers.get(payment.provider);
    try {
      if (!provider) throw new DomainError("UPSTREAM_UNAVAILABLE", `Payment provider ${payment.provider} is not configured in this process.`);
      const result = await provider.refund({
        paymentId,
        orderId: payment.orderId,
        refundId,
        providerTransactionId: payment.providerTransactionId,
        amountCents: refund.amountCents,
        currency: payment.amount.currency,
        reason: refund.reason,
        full: refund.amountCents === payment.amount.cents,
      });
      await this.record(paymentId, (p, now) => {
        if (result.status === "succeeded") p.completeRefund(refundId, result.providerRefundId, now);
        else p.markRefundSubmitted(refundId, result.providerRefundId, now);
      });
      (result.status === "succeeded" ? report.succeeded : report.submitted).push(refundId);
    } catch (error) {
      if (error instanceof ProviderRejectedError) {
        log.warn("provider rejected refund", { paymentId, refundId, provider: error.provider, providerCode: error.providerCode });
        // A rejection may free balance a voided payment still owes the customer: schedule that refund durably.
        await this.record(paymentId, (p, now) => p.failRefund(refundId, `Refund rejected by the payment provider${error.providerCode ? ` (${error.providerCode})` : ""}.`, now), true);
        report.failed.push(refundId);
        return;
      }
      await this.record(paymentId, (p, now) => p.releaseRefundDispatch(refundId, now)).catch((releaseError: unknown) =>
        log.warn("could not release refund dispatch lease; it will expire", { paymentId, refundId, error: releaseError }),
      );
      throw error;
    }
  }

  /** Applies one outcome in its own transaction. Only rejections schedule follow-up void refunds, so outages never fan out. */
  private record(paymentId: string, change: (payment: Payment, now: Date) => void, scheduleVoidRefunds = false) {
    return this.uow.run(async (tx) => {
      const payment = await tx.payments.lock({ id: paymentId });
      if (!payment) throw new DomainError("NOT_FOUND", "Payment disappeared while refunding.", { paymentId });
      change(payment, this.clock.now());
      await tx.payments.save(payment);
      await tx.write(messagesFor(payment, { scheduleVoidRefunds }));
    });
  }
}
