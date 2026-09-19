import type { CommandEnvelope } from "@meridian/contracts";
import { PermanentError, RabbitCommandHandler, type RabbitHandlerMeta } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { EMAIL_TEMPLATES } from "../../domain";
import { EmailSendFailedError, SendEmailCommand } from "../commands";
import { asPermanentOnRuleViolation, parsePayload } from "./message-errors";

export const sendEmailPayload = z.object({
  template: z.enum(EMAIL_TEMPLATES),
  to: z.object({ email: z.string().min(3).max(254), name: z.string().max(200).nullable() }),
  data: z.record(z.string(), z.unknown()),
  dedupeKey: z.string().min(1).max(200),
});

/** The only way mail leaves the platform: the `notification.send-email` RabbitMQ command queue. */
@Injectable()
export class SendEmailConsumer {
  constructor(private readonly commandBus: CommandBus) {}

  @RabbitCommandHandler({ command: "notification.send-email", prefetch: 10 })
  async handle(envelope: CommandEnvelope, meta: RabbitHandlerMeta): Promise<void> {
    const payload = parsePayload(sendEmailPayload, envelope.payload, envelope.name);
    try {
      await asPermanentOnRuleViolation(() =>
        this.commandBus.execute(
          new SendEmailCommand(payload.template, payload.to, payload.data, payload.dedupeKey, {
            correlationId: envelope.correlationId,
            messageId: envelope.messageId,
            attempt: meta.attempt,
            maxAttempts: meta.maxAttempts,
          }),
        ),
      );
    } catch (error) {
      if (error instanceof EmailSendFailedError) {
        // Transient failures go back to RabbitMQ for the next retry tier; permanent ones straight to the DLQ.
        if (error.permanent) throw new PermanentError(error.message, { deliveryId: error.deliveryId }, { cause: error });
        throw new Error(error.message, { cause: error });
      }
      throw error;
    }
  }
}
