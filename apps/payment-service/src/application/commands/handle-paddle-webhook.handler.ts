import { createLogger } from "@meridian/nest-kit";
import { CLOCK, type Clock, ConflictError, ValidationError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { z } from "zod";
import type { Payment } from "../../domain";
import { messagesFor, outboundMessages } from "../services/outbound-messages";
import { type PaymentTransaction, UnitOfWork, WebhookVerifier } from "../ports";
import { HandlePaddleWebhookCommand, type WebhookResult } from "./handle-paddle-webhook.command";

const log = createLogger("PaddleWebhook");
export const PADDLE_WEBHOOK_CONSUMER = "paddle-webhook";

const notificationSchema = z.object({
  notification_id: z.string().min(1).max(200),
  event_type: z.string().min(1).max(100),
  data: z.record(z.string(), z.unknown()),
});

const transactionSchema = z.object({
  id: z.string().min(1).max(200),
  custom_data: z.object({ paymentId: z.string().max(200).optional(), orderId: z.string().max(200).optional() }).partial().nullish(),
});

const adjustmentSchema = z.object({
  id: z.string().min(1).max(200),
  action: z.string().max(50).optional(),
  status: z.string().max(50),
  transaction_id: z.string().max(200).nullish(),
});

const SETTLING = new Set(["transaction.completed", "transaction.paid"]);
const ADJUSTMENT = new Set(["adjustment.created", "adjustment.updated"]);

/**
 * Signed Paddle notifications: signature (h1 HMAC, 5 min tolerance) → Inbox on notification_id → state change and
 * outbox rows, all in one transaction, so a replayed or concurrent duplicate notification has no effect.
 */
@CommandHandler(HandlePaddleWebhookCommand)
export class HandlePaddleWebhookHandler implements ICommandHandler<HandlePaddleWebhookCommand, WebhookResult> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly verifier: WebhookVerifier,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ rawBody, signature }: HandlePaddleWebhookCommand): Promise<WebhookResult> {
    this.verifier.verify(rawBody, signature, this.clock.now());
    const notification = this.parse(rawBody!);
    return this.uow.run(async (tx) => {
      if (!(await tx.claim(PADDLE_WEBHOOK_CONSUMER, notification.notification_id))) return { received: true, outcome: "duplicate" };
      let processed = false;
      if (SETTLING.has(notification.event_type)) processed = await this.settle(tx, notification.data);
      else if (notification.event_type === "transaction.canceled") processed = await this.cancel(tx, notification.data);
      else if (ADJUSTMENT.has(notification.event_type)) processed = await this.adjust(tx, notification.data);
      if (!processed) log.info("paddle notification ignored", { notificationId: notification.notification_id, eventType: notification.event_type });
      return { received: true, outcome: processed ? "processed" : "ignored" };
    });
  }

  private parse(rawBody: Buffer) {
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new ValidationError("Webhook body is not valid JSON.");
    }
    const parsed = notificationSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError("Webhook body is not a Paddle notification.");
    return parsed.data;
  }

  private async findTransactionPayment(tx: PaymentTransaction, data: Record<string, unknown>): Promise<Payment | null> {
    const parsed = transactionSchema.safeParse(data);
    if (!parsed.success) return null;
    const { id, custom_data } = parsed.data;
    const payment = custom_data?.paymentId ? await tx.payments.lock({ id: custom_data.paymentId }) : await tx.payments.lock({ providerTransactionId: id });
    if (!payment) return null;
    const mismatched =
      payment.provider !== "paddle-sandbox" ||
      (payment.providerTransactionId !== null && payment.providerTransactionId !== id) ||
      (custom_data?.orderId !== undefined && custom_data.orderId !== payment.orderId);
    if (mismatched) {
      log.warn("paddle notification does not match the payment it references", { paymentId: payment.id });
      return null;
    }
    // The notification can arrive before the intent request attached the transaction id.
    if (!payment.providerTransactionId) payment.attachProviderTransaction(id, this.clock.now());
    return payment;
  }

  private async settle(tx: PaymentTransaction, data: Record<string, unknown>): Promise<boolean> {
    const payment = await this.findTransactionPayment(tx, data);
    if (!payment) return false;
    const outcome = payment.recordProviderCapture(this.clock.now());
    await tx.payments.save(payment);
    if (outcome === "refund-required") {
      log.warn("paddle captured a payment that was already closed; refunding it", { paymentId: payment.id, orderId: payment.orderId });
    }
    // Durable follow-up for refund-required: a payment.void command dispatches the scheduled refund with RabbitMQ retries.
    await tx.write(messagesFor(payment));
    return outcome !== "duplicate";
  }

  private async cancel(tx: PaymentTransaction, data: Record<string, unknown>): Promise<boolean> {
    const payment = await this.findTransactionPayment(tx, data);
    if (!payment) return false;
    const changed = payment.fail("Transaction canceled at Paddle", this.clock.now());
    await tx.payments.save(payment);
    await tx.write(outboundMessages(payment.pullEvents()));
    return changed;
  }

  private async adjust(tx: PaymentTransaction, data: Record<string, unknown>): Promise<boolean> {
    const parsed = adjustmentSchema.safeParse(data);
    if (!parsed.success || (parsed.data.action && parsed.data.action !== "refund")) return false;
    const adjustment = parsed.data;
    const payment = await tx.payments.lock({ providerRefundId: adjustment.id });
    if (!payment) {
      const owner = adjustment.transaction_id ? await tx.payments.lock({ providerTransactionId: adjustment.transaction_id }) : null;
      // Our refund call may not have stored the adjustment id yet: answer non-2xx so Paddle redelivers later.
      if (owner && owner.refundsAwaitingDispatch().length) throw new ConflictError("Refund is still being recorded; retry later.");
      return false;
    }
    const refund = payment.snapshot().refunds.find((r) => r.providerRefundId === adjustment.id);
    if (!refund) return false;
    const now = this.clock.now();
    let changed = false;
    if (adjustment.status === "approved") changed = payment.completeRefund(refund.refundId, adjustment.id, now);
    else if (adjustment.status === "rejected") changed = payment.failRefund(refund.refundId, "Refund rejected by Paddle.", now);
    if (!changed) return false;
    await tx.payments.save(payment);
    await tx.write(messagesFor(payment));
    return true;
  }
}
