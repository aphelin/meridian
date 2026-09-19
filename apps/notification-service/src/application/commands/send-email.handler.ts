import { counter, createLogger } from "@meridian/nest-kit";
import { CLOCK, DomainError, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DeliveryInFlightError, EmailAddress, EmailDelivery } from "../../domain";
import {
  EmailRenderer,
  IdGenerator,
  Mailer,
  MailRejectedError,
  NOTIFICATION_SETTINGS,
  TemplateDataError,
  UnitOfWork,
  type NotificationSettings,
  type RenderedEmail,
} from "../ports";
import { EmailSendFailedError, SendEmailCommand, type SendEmailResult } from "./send-email.command";

const log = createLogger("SendEmail");
const emailsTotal = () => counter("emails_total", "Email delivery outcomes", ["template", "result"]);

const errorText = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

type Start = { kind: "send"; deliveryId: string } | { kind: "settled"; deliveryId: string; outcome: "duplicate" | "suppressed" };

/**
 * Sends one email at most once per dedupeKey:
 * 1. render (invalid data → dead-lettered row, permanent failure);
 * 2. transaction: create or lock the delivery row; settled → duplicate suppressed; else start an attempt (lease);
 * 3. SMTP send outside any transaction (timeouts + breaker in the adapter);
 * 4. transaction: mark sent + EmailSent, or record the failure (final attempt → dead-lettered + EmailDeadLettered).
 * Delivery is at-least-once only if step 4 cannot be committed after SMTP accepted the message.
 */
@CommandHandler(SendEmailCommand)
export class SendEmailHandler implements ICommandHandler<SendEmailCommand, SendEmailResult> {
  /** Waits for a concurrent attempt on the same dedupeKey before giving the message back for a retry. */
  static inFlightWaitsMs: readonly number[] = [250, 500, 1000, 2000];
  /** Retries of the post-send bookkeeping transaction (the email is already out; do not lose that fact). */
  static recordRetriesMs: readonly number[] = [200, 1000];

  constructor(
    private readonly uow: UnitOfWork,
    private readonly mailer: Mailer,
    private readonly renderer: EmailRenderer,
    private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(NOTIFICATION_SETTINGS) private readonly settings: NotificationSettings,
  ) {}

  async execute(command: SendEmailCommand): Promise<SendEmailResult> {
    let recipient: EmailAddress;
    try {
      recipient = EmailAddress.parse(command.to.email);
    } catch (error) {
      throw new EmailSendFailedError(`Invalid recipient for ${command.template}`, true, null, { cause: error });
    }
    const to = { email: recipient.value, name: command.to.name?.trim() || null };

    let rendered: RenderedEmail;
    try {
      rendered = this.renderer.render(command.template, command.data, to);
    } catch (error) {
      if (!(error instanceof TemplateDataError)) throw error;
      const deliveryId = await this.rejectUnrenderable(command, recipient, error);
      emailsTotal().inc({ template: command.template, result: "invalid" });
      throw new EmailSendFailedError(error.message, true, deliveryId, { cause: error });
    }

    const start = await this.startAttempt(command, recipient, rendered.subject);
    if (start.kind === "settled") {
      log.info(start.outcome === "duplicate" ? "duplicate email suppressed" : "email suppressed", { template: command.template, deliveryId: start.deliveryId, dedupeKey: command.dedupeKey });
      emailsTotal().inc({ template: command.template, result: start.outcome });
      return { outcome: start.outcome, deliveryId: start.deliveryId };
    }

    const deliveryId = start.deliveryId;
    let smtpMessageId: string | null;
    try {
      const receipt = await this.mailer.send({
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        replyTo: rendered.replyTo,
        headers: { "X-Correlation-Id": command.delivery.correlationId, "X-Meridian-Delivery": deliveryId, "X-Meridian-Template": command.template },
      });
      smtpMessageId = receipt.messageId;
    } catch (error) {
      const permanent = error instanceof MailRejectedError;
      const final = permanent || command.delivery.attempt >= command.delivery.maxAttempts;
      await this.uow.run(async (tx) => {
        const delivery = await tx.deliveries.lockByDedupeKey(command.dedupeKey);
        if (!delivery || delivery.isSettled) return;
        delivery.recordFailure(errorText(error), final, this.clock.now());
        await tx.deliveries.save(delivery);
        await tx.publish(delivery.pullEvents());
      });
      emailsTotal().inc({ template: command.template, result: final ? "dead-lettered" : "failed" });
      log.warn(final ? "email dead-lettered" : "email send failed; will retry", { template: command.template, deliveryId, attempt: command.delivery.attempt, permanent, error: errorText(error) });
      throw new EmailSendFailedError(`Sending ${command.template} failed: ${errorText(error)}`, permanent, deliveryId, { cause: error });
    }

    await this.recordSent(command.dedupeKey, smtpMessageId);
    emailsTotal().inc({ template: command.template, result: "sent" });
    log.info("email sent", { template: command.template, deliveryId, attempt: command.delivery.attempt });
    return { outcome: "sent", deliveryId };
  }

  private async startAttempt(command: SendEmailCommand, recipient: EmailAddress, subject: string): Promise<Start> {
    const waits = SendEmailHandler.inFlightWaitsMs;
    for (let i = 0; ; i++) {
      try {
        return await this.uow.run(async (tx): Promise<Start> => {
          const now = this.clock.now();
          await tx.deliveries.insertIfMissing(
            EmailDelivery.queue({ id: this.ids.next("eml"), dedupeKey: command.dedupeKey, template: command.template, to: recipient, toName: command.to.name?.trim() || null, subject, correlationId: command.delivery.correlationId, now }),
          );
          const delivery = await tx.deliveries.lockByDedupeKey(command.dedupeKey);
          if (!delivery) throw new Error(`delivery ${command.dedupeKey} vanished inside its transaction`);
          if (delivery.isSettled) return { kind: "settled", deliveryId: delivery.id, outcome: delivery.status === "suppressed" ? "suppressed" : "duplicate" };
          if (recipient.isUndeliverable && delivery.attempts === 0) {
            delivery.suppress(`Recipient domain ${recipient.domain} cannot receive mail`, now);
            await tx.deliveries.save(delivery);
            return { kind: "settled", deliveryId: delivery.id, outcome: "suppressed" };
          }
          delivery.beginAttempt(now, this.settings.sendLeaseMs, command.delivery.attempt);
          await tx.deliveries.save(delivery);
          return { kind: "send", deliveryId: delivery.id };
        });
      } catch (error) {
        if (!(error instanceof DeliveryInFlightError) || i >= waits.length) throw error;
        await new Promise((resolve) => setTimeout(resolve, waits[i]));
      }
    }
  }

  private async recordSent(dedupeKey: string, smtpMessageId: string | null): Promise<void> {
    const retries = SendEmailHandler.recordRetriesMs;
    for (let i = 0; ; i++) {
      try {
        await this.uow.run(async (tx) => {
          const delivery = await tx.deliveries.lockByDedupeKey(dedupeKey);
          if (!delivery) throw new Error(`delivery ${dedupeKey} not found after sending`);
          delivery.markSent(this.clock.now(), smtpMessageId);
          await tx.deliveries.save(delivery);
          await tx.publish(delivery.pullEvents());
        });
        return;
      } catch (error) {
        if (error instanceof DomainError || i >= retries.length) throw error;
        log.warn("recording a sent email failed; retrying", { dedupeKey, error: errorText(error) });
        await new Promise((resolve) => setTimeout(resolve, retries[i]));
      }
    }
  }

  /** Records the unrenderable email as dead-lettered so it is visible in the delivery log. */
  private async rejectUnrenderable(command: SendEmailCommand, recipient: EmailAddress, error: TemplateDataError): Promise<string | null> {
    return this.uow.run(async (tx) => {
      const now = this.clock.now();
      await tx.deliveries.insertIfMissing(
        EmailDelivery.queue({ id: this.ids.next("eml"), dedupeKey: command.dedupeKey, template: command.template, to: recipient, toName: command.to.name?.trim() || null, subject: `(${command.template}: invalid template data)`, correlationId: command.delivery.correlationId, now }),
      );
      const delivery = await tx.deliveries.lockByDedupeKey(command.dedupeKey);
      if (!delivery || delivery.isSettled) return delivery?.id ?? null;
      if (delivery.isLeased(now)) return delivery.id;
      delivery.beginAttempt(now, this.settings.sendLeaseMs, command.delivery.attempt);
      delivery.recordFailure(`${error.message}: ${JSON.stringify((error.details as { issues?: string[] })?.issues ?? [])}`, true, now);
      await tx.deliveries.save(delivery);
      await tx.publish(delivery.pullEvents());
      return delivery.id;
    });
  }
}
