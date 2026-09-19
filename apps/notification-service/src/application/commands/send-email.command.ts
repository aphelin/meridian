import type { CommandPayloads, EmailTemplate } from "@meridian/contracts";

export type SendEmailPayload = CommandPayloads["notification.send-email"];

/** Render and send one email; the application side of the `notification.send-email` RabbitMQ command. */
export class SendEmailCommand {
  constructor(
    readonly template: EmailTemplate,
    readonly to: { email: string; name: string | null },
    readonly data: Record<string, unknown>,
    readonly dedupeKey: string,
    readonly delivery: {
      correlationId: string;
      messageId: string;
      /** 1-based delivery attempt of the command message. */
      attempt: number;
      maxAttempts: number;
    },
  ) {}
}

export type SendEmailOutcome = "sent" | "duplicate" | "suppressed";

export interface SendEmailResult {
  outcome: SendEmailOutcome;
  deliveryId: string;
}

/** The send failed; the delivery row already records it. `permanent` failures must not be retried. */
export class EmailSendFailedError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly deliveryId: string | null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EmailSendFailedError";
  }
}
