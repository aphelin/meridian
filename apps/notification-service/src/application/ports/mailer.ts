export interface OutgoingEmail {
  to: { email: string; name: string | null };
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Correlation id and delivery id travel as headers so a message in the mail catcher can be traced back. */
  headers: Record<string, string>;
}

export interface MailReceipt {
  messageId: string | null;
}

/**
 * The relay refused the message for a reason a retry cannot fix (e.g. SMTP 5xx: mailbox does not exist).
 * Anything else a Mailer throws (timeouts, connection errors, 4xx, open breaker) is treated as transient.
 */
export class MailRejectedError extends Error {
  constructor(
    message: string,
    readonly responseCode: number | null,
  ) {
    super(message);
    this.name = "MailRejectedError";
  }
}

/** Sends one email through the sandbox relay. Implementations bound every call with timeouts and a circuit breaker. */
export abstract class Mailer {
  abstract send(email: OutgoingEmail): Promise<MailReceipt>;
}
