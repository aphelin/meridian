import { createLogger } from "@meridian/nest-kit";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { z } from "zod";
import type { Payment } from "../../domain";
import { messagesFor, outboundMessages } from "../services/outbound-messages";
import { type PaymentTransaction, StripeWebhookVerifier, UnitOfWork } from "../ports";
import type { WebhookResult } from "./handle-paddle-webhook.command";
import { HandleStripeWebhookCommand } from "./handle-stripe-webhook.command";

const log = createLogger("StripeWebhook");
export const STRIPE_WEBHOOK_CONSUMER = "stripe-webhook";

const metadata = z.record(z.string(), z.string()).nullish();

const paymentIntentSchema = z.object({
  id: z.string().min(1).max(200),
  object: z.literal("payment_intent"),
  amount: z.number().int().nonnegative(),
  currency: z.string().max(10),
  metadata,
  last_payment_error: z.object({ code: z.string().nullish(), decline_code: z.string().nullish(), message: z.string().nullish() }).nullish(),
});

const refundSchema = z.object({
  id: z.string().min(1).max(200),
  object: z.literal("refund"),
  status: z.string().max(50).nullish(),
  payment_intent: z.union([z.string(), z.object({ id: z.string() })]).nullish(),
  failure_reason: z.string().nullish(),
  metadata,
});

const REFUND_EVENTS = new Set(["refund.created", "refund.updated", "refund.failed", "charge.refund.updated"]);

/**
 * Signed Stripe events: signature (Stripe SDK constructEvent, 5 min tolerance) → Inbox on the Stripe event id → state
 * change and outbox rows, all in one transaction, so a replayed or concurrent duplicate event has no effect.
 * - payment_intent.succeeded: the payment is captured (PaymentSucceeded + checkout.confirm-payment), or refunded in full
 *   if it was already closed;
 * - payment_intent.payment_failed: the attempt is recorded, the payment stays pending (the Payment Element can retry);
 * - payment_intent.canceled: the payment fails;
 * - refund.* / charge.refund.updated: a refund that Stripe first answered as pending succeeds or fails.
 */
@CommandHandler(HandleStripeWebhookCommand)
export class HandleStripeWebhookHandler implements ICommandHandler<HandleStripeWebhookCommand, WebhookResult> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly verifier: StripeWebhookVerifier,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ rawBody, signature }: HandleStripeWebhookCommand): Promise<WebhookResult> {
    const event = this.verifier.verify(rawBody, signature, this.clock.now());
    return this.uow.run(async (tx) => {
      if (!(await tx.claim(STRIPE_WEBHOOK_CONSUMER, event.id))) return { received: true, outcome: "duplicate" };
      let processed = false;
      const object = event.data.object;
      if (event.type === "payment_intent.succeeded") processed = await this.settle(tx, object);
      else if (event.type === "payment_intent.payment_failed") processed = await this.attemptFailed(tx, object);
      else if (event.type === "payment_intent.canceled") processed = await this.cancel(tx, object);
      else if (REFUND_EVENTS.has(event.type)) processed = await this.refund(tx, object);
      if (!processed) log.info("stripe event ignored", { eventId: event.id, eventType: event.type });
      else log.info("stripe event processed", { eventId: event.id, eventType: event.type });
      return { received: true, outcome: processed ? "processed" : "ignored" };
    });
  }

  private async findIntentPayment(tx: PaymentTransaction, object: Record<string, unknown>): Promise<{ payment: Payment; intent: z.output<typeof paymentIntentSchema> } | null> {
    const parsed = paymentIntentSchema.safeParse(object);
    if (!parsed.success) return null;
    const intent = parsed.data;
    const paymentId = intent.metadata?.paymentId;
    const payment = paymentId ? await tx.payments.lock({ id: paymentId }) : await tx.payments.lock({ providerTransactionId: intent.id });
    if (!payment) return null;
    const mismatched =
      payment.provider !== "stripe-test" ||
      (payment.providerTransactionId !== null && payment.providerTransactionId !== intent.id) ||
      (intent.metadata?.orderId !== undefined && intent.metadata.orderId !== payment.orderId) ||
      intent.amount !== payment.amount.cents ||
      intent.currency.toUpperCase() !== payment.amount.currency;
    if (mismatched) {
      log.warn("stripe event does not match the payment it references", { paymentId: payment.id, paymentIntent: intent.id });
      return null;
    }
    // The event can arrive before the intent request attached the PaymentIntent id.
    if (!payment.providerTransactionId) payment.attachProviderTransaction(intent.id, this.clock.now());
    return { payment, intent };
  }

  private async settle(tx: PaymentTransaction, object: Record<string, unknown>): Promise<boolean> {
    const found = await this.findIntentPayment(tx, object);
    if (!found) return false;
    const { payment } = found;
    const outcome = payment.recordProviderCapture(this.clock.now());
    await tx.payments.save(payment);
    if (outcome === "refund-required") {
      log.warn("stripe captured a payment that was already closed; refunding it", { paymentId: payment.id, orderId: payment.orderId });
    }
    // Durable follow-up for refund-required: a payment.void command dispatches the scheduled refund with RabbitMQ retries.
    await tx.write(messagesFor(payment));
    return outcome !== "duplicate";
  }

  private async attemptFailed(tx: PaymentTransaction, object: Record<string, unknown>): Promise<boolean> {
    const found = await this.findIntentPayment(tx, object);
    if (!found) return false;
    const { payment, intent } = found;
    const error = intent.last_payment_error;
    const reason = `Payment attempt declined at Stripe${error?.decline_code || error?.code ? ` (${error.decline_code ?? error.code})` : ""}`;
    const changed = payment.recordFailedAttempt(reason, this.clock.now());
    await tx.payments.save(payment);
    if (changed) log.info("stripe payment attempt failed; the shopper can retry", { paymentId: payment.id, code: error?.decline_code ?? error?.code ?? null });
    return changed;
  }

  private async cancel(tx: PaymentTransaction, object: Record<string, unknown>): Promise<boolean> {
    const found = await this.findIntentPayment(tx, object);
    if (!found) return false;
    const { payment } = found;
    const changed = payment.fail("PaymentIntent canceled at Stripe", this.clock.now());
    await tx.payments.save(payment);
    await tx.write(outboundMessages(payment.pullEvents()));
    return changed;
  }

  private async refund(tx: PaymentTransaction, object: Record<string, unknown>): Promise<boolean> {
    const parsed = refundSchema.safeParse(object);
    if (!parsed.success) return false;
    const stripeRefund = parsed.data;
    // Our refund call may not have stored the Stripe refund id yet: its metadata names the Meridian refund.
    let payment = await tx.payments.lock({ providerRefundId: stripeRefund.id });
    if (!payment && stripeRefund.metadata?.paymentId) payment = await tx.payments.lock({ id: stripeRefund.metadata.paymentId });
    if (!payment || payment.provider !== "stripe-test") return false;
    const refund =
      payment.snapshot().refunds.find((r) => r.providerRefundId === stripeRefund.id) ??
      (stripeRefund.metadata?.refundId ? payment.snapshot().refunds.find((r) => r.refundId === stripeRefund.metadata!.refundId && r.providerRefundId === null) : undefined);
    if (!refund) return false;
    const intentId = typeof stripeRefund.payment_intent === "string" ? stripeRefund.payment_intent : stripeRefund.payment_intent?.id;
    if (intentId && payment.providerTransactionId && intentId !== payment.providerTransactionId) {
      log.warn("stripe refund does not match the payment it references", { paymentId: payment.id, refund: stripeRefund.id });
      return false;
    }
    const now = this.clock.now();
    let changed = false;
    if (stripeRefund.status === "succeeded") changed = payment.completeRefund(refund.refundId, stripeRefund.id, now);
    else if (stripeRefund.status === "failed" || stripeRefund.status === "canceled") {
      changed = payment.failRefund(refund.refundId, `Refund ${stripeRefund.status} at Stripe${stripeRefund.failure_reason ? ` (${stripeRefund.failure_reason})` : ""}.`, now);
    }
    if (!changed) return false;
    await tx.payments.save(payment);
    await tx.write(messagesFor(payment));
    return true;
  }
}
