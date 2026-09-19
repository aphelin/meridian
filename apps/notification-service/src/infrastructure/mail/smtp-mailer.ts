import { assertSandboxSmtp, createBreaker, createLogger, envInt, onShutdown, type KitBreaker } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { Mailer, MailRejectedError, type MailReceipt, type OutgoingEmail } from "../../application/ports";

export const SMTP_BREAKER = "smtp";
export const SMTP_CHAOS_TARGET = "smtp.send";
export const MAIL_FROM = { name: "Meridian", address: "no-reply@meridian.local" };

/** Contract timeouts: every SMTP stage is bounded so a stuck relay cannot hold a consumer slot forever. */
export const SMTP_TIMEOUTS = { connectionTimeout: 5_000, greetingTimeout: 5_000, socketTimeout: 10_000 } as const;
/** Hard ceiling for one send through the breaker (connect + greeting + DATA with socket timeouts). */
export const SMTP_CALL_TIMEOUT_MS = 30_000;

/** SMTP replies that say this recipient/message will never be accepted, so retrying is pointless. */
const PERMANENT_REPLY_CODES = new Set([550, 551, 552, 553, 554]);

const log = createLogger("SmtpMailer");

export interface SmtpConfig {
  host: string;
  port: number;
}

/** Reads SMTP settings and refuses anything but a sandbox mail catcher (throws SANDBOX_ONLY). No credentials, ever. */
export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  assertSandboxSmtp(env);
  return { host: env.SMTP_HOST!.trim(), port: envInt("SMTP_PORT", 1025, { min: 1, max: 65_535, env }) };
}

/**
 * nodemailer adapter for the sandbox relay (Mailhog). Guarded by `assertSandboxSmtp` at construction, bounded by
 * the contract timeouts, wrapped in circuit breaker "smtp" with chaos target "smtp.send".
 */
@Injectable()
export class SmtpMailer extends Mailer {
  private readonly transport: Transporter;
  private readonly breaker: KitBreaker<[OutgoingEmail], MailReceipt>;

  constructor() {
    super();
    const config = smtpConfigFromEnv();
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: false,
      // Mail catchers do not speak TLS; nothing sensitive crosses this local hop and no auth is ever configured.
      ignoreTLS: true,
      ...SMTP_TIMEOUTS,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    this.breaker = createBreaker(SMTP_BREAKER, SMTP_CHAOS_TARGET, (email: OutgoingEmail) => this.deliver(email), {
      timeoutMs: SMTP_CALL_TIMEOUT_MS,
      // A mailbox that does not exist says nothing about the relay's health.
      isNeutral: (error) => error instanceof MailRejectedError,
    });
    onShutdown("smtp", "resources", () => this.transport.close());
    log.info("sandbox SMTP relay configured", { host: config.host, port: config.port });
  }

  send(email: OutgoingEmail): Promise<MailReceipt> {
    return this.breaker.fire(email);
  }

  private async deliver(email: OutgoingEmail): Promise<MailReceipt> {
    try {
      const info = await this.transport.sendMail({
        from: MAIL_FROM,
        to: email.to.name ? { name: email.to.name, address: email.to.email } : email.to.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
        headers: email.headers,
      });
      return { messageId: typeof info.messageId === "string" ? info.messageId : null };
    } catch (error) {
      const code = (error as { responseCode?: unknown }).responseCode;
      if (typeof code === "number" && PERMANENT_REPLY_CODES.has(code)) {
        throw new MailRejectedError(`SMTP ${code}: ${(error as Error).message}`, code);
      }
      throw error;
    }
  }
}
