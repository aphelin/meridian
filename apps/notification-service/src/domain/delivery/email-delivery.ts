import type { EmailTemplate } from "@meridian/contracts";
import { createHash } from "node:crypto";
import { AggregateRoot, DomainError, ValidationError, ensure } from "@meridian/kernel";
import { EmailDeliveryAggregate, isEmailTemplate, type NotificationEvent } from "../events";
import { EmailAddress } from "../shared/email-address";

export type DeliveryStatus = "queued" | "sent" | "failed" | "dead-lettered" | "suppressed";

export interface EmailDeliveryState {
  id: string;
  dedupeKey: string;
  template: EmailTemplate;
  toEmail: string;
  toName: string | null;
  subject: string;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  correlationId: string;
  leaseUntil: Date | null;
  smtpMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

export interface QueueDelivery {
  id: string;
  dedupeKey: string;
  template: EmailTemplate;
  to: EmailAddress;
  toName: string | null;
  subject: string;
  correlationId: string;
  now: Date;
}

const MAX_DEDUPE_KEY = 200;
const MAX_ERROR = 500;
// Any text without control characters: other services choose their keys (the contract only says "string").
const DEDUPE_KEY = /^[^\u0000-\u001f\u007f]+$/;

/** Another attempt for the same dedupeKey is talking to SMTP right now. Retryable. */
export class DeliveryInFlightError extends DomainError {
  constructor(readonly deliveryId: string, readonly leaseUntil: Date) {
    super("CONFLICT", "This email is already being sent.", { deliveryId, leaseUntil: leaseUntil.toISOString() });
    this.name = "DeliveryInFlightError";
  }
}

export function assertDedupeKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || !key.length || key.length > MAX_DEDUPE_KEY || !DEDUPE_KEY.test(key)) {
    throw new ValidationError(`dedupeKey must be 1-${MAX_DEDUPE_KEY} characters without control characters`);
  }
}

/** Builds a dedupe key from business identifiers; keys that would exceed the limit keep their prefix and hash the rest. */
export function dedupeKeyOf(prefix: string, ...parts: string[]): string {
  const key = [prefix, ...parts].join(":").replace(/[\u0000-\u001f\u007f]/g, "");
  if (key.length <= MAX_DEDUPE_KEY) return key;
  return `${prefix}:sha256:${createHash("sha256").update(key).digest("hex")}`;
}

const truncate = (text: string) => (text.length > MAX_ERROR ? `${text.slice(0, MAX_ERROR - 1)}…` : text);

/**
 * The delivery log entry of one logical email, identified by its dedupeKey.
 * Invariants:
 * - `sent` and `suppressed` are terminal: a delivered email is never attempted again (duplicates are suppressed).
 * - Only one attempt at a time holds the send lease; attempts are counted on every try, including replays.
 * - A failure on the final attempt (or a permanent failure) dead-letters the delivery and raises EmailDeadLettered;
 *   a later successful attempt (a replay from the DLQ) still marks it sent and raises EmailSent.
 */
export class EmailDelivery extends AggregateRoot<NotificationEvent> {
  private constructor(private state: EmailDeliveryState) {
    super();
  }

  static queue(input: QueueDelivery): EmailDelivery {
    assertDedupeKey(input.dedupeKey);
    ensure(isEmailTemplate(input.template), "VALIDATION_FAILED", `Unknown email template ${String(input.template)}`);
    ensure(input.subject.trim().length > 0, "VALIDATION_FAILED", "An email needs a subject");
    return new EmailDelivery({
      id: input.id,
      dedupeKey: input.dedupeKey,
      template: input.template,
      toEmail: input.to.value,
      toName: input.toName,
      subject: input.subject,
      status: "queued",
      attempts: 0,
      lastError: null,
      correlationId: input.correlationId,
      leaseUntil: null,
      smtpMessageId: null,
      createdAt: input.now,
      updatedAt: input.now,
      sentAt: null,
    });
  }

  static restore(state: EmailDeliveryState): EmailDelivery {
    return new EmailDelivery({ ...state });
  }

  get id() {
    return this.state.id;
  }
  get dedupeKey() {
    return this.state.dedupeKey;
  }
  get status() {
    return this.state.status;
  }
  get attempts() {
    return this.state.attempts;
  }
  get lastError() {
    return this.state.lastError;
  }
  get recipient() {
    return this.state.toEmail;
  }

  /** Delivered or deliberately not sent: nothing more will ever happen to this email. */
  get isSettled(): boolean {
    return this.state.status === "sent" || this.state.status === "suppressed";
  }

  isLeased(now: Date): boolean {
    return this.state.leaseUntil !== null && this.state.leaseUntil.getTime() > now.getTime();
  }

  /**
   * Starts a send attempt: counts it and takes the lease until `now + leaseMs`.
   * `transportAttempt` is the broker's delivery attempt number: deliveries that failed before reaching this
   * bookkeeping (a crash, a database outage, handler chaos) are still counted, so the log never under-reports.
   * Refuses settled deliveries (CONFLICT) and deliveries another attempt is still sending (DeliveryInFlightError).
   */
  beginAttempt(now: Date, leaseMs: number, transportAttempt = 1): void {
    ensure(!this.isSettled, "CONFLICT", `Email ${this.state.id} is already ${this.state.status}.`);
    ensure(Number.isFinite(leaseMs) && leaseMs > 0, "VALIDATION_FAILED", "Lease must be positive");
    if (this.isLeased(now)) throw new DeliveryInFlightError(this.state.id, this.state.leaseUntil!);
    const counted = Number.isSafeInteger(transportAttempt) && transportAttempt > 0 ? transportAttempt : 1;
    this.state.attempts = Math.max(this.state.attempts + 1, counted);
    this.state.status = "queued";
    this.state.leaseUntil = new Date(now.getTime() + leaseMs);
    this.state.updatedAt = now;
  }

  /** The relay accepted the message. Raises EmailSent. */
  markSent(now: Date, smtpMessageId: string | null): void {
    ensure(this.state.status !== "suppressed", "CONFLICT", `Email ${this.state.id} was suppressed.`);
    if (this.state.status === "sent") return;
    ensure(this.state.attempts > 0, "INVALID_TRANSITION", "An email cannot be sent before an attempt was started.");
    this.state.status = "sent";
    this.state.sentAt = now;
    this.state.leaseUntil = null;
    this.state.smtpMessageId = smtpMessageId;
    this.state.updatedAt = now;
    this.raise({
      name: "EmailSent",
      aggregateType: EmailDeliveryAggregate,
      aggregateId: this.state.id,
      occurredAt: now,
      payload: { deliveryId: this.state.id, template: this.state.template, to: this.state.toEmail },
    });
  }

  /**
   * Records a failed attempt and releases the lease. `final` (last retry tier or a permanent failure) moves the
   * delivery to dead-lettered and raises EmailDeadLettered; otherwise it is `failed` and will be retried.
   */
  recordFailure(error: string, final: boolean, now: Date): void {
    ensure(!this.isSettled, "INVALID_TRANSITION", `Email ${this.state.id} is already ${this.state.status}.`);
    ensure(this.state.attempts > 0, "INVALID_TRANSITION", "A failure needs a started attempt.");
    const message = truncate(error.trim() || "Unknown error");
    this.state.lastError = message;
    this.state.leaseUntil = null;
    this.state.updatedAt = now;
    if (!final) {
      this.state.status = "failed";
      return;
    }
    const alreadyDeadLettered = this.state.status === "dead-lettered";
    this.state.status = "dead-lettered";
    if (alreadyDeadLettered) return;
    this.raise({
      name: "EmailDeadLettered",
      aggregateType: EmailDeliveryAggregate,
      aggregateId: this.state.id,
      occurredAt: now,
      payload: { deliveryId: this.state.id, template: this.state.template, to: this.state.toEmail, error: message },
    });
  }

  /** Deliberately not sent (e.g. an anonymised, undeliverable address). Only before any attempt. */
  suppress(reason: string, now: Date): void {
    if (this.state.status === "suppressed") return;
    ensure(this.state.status === "queued" && this.state.attempts === 0, "INVALID_TRANSITION", `Email ${this.state.id} can no longer be suppressed.`);
    this.state.status = "suppressed";
    this.state.lastError = truncate(reason);
    this.state.updatedAt = now;
  }

  snapshot(): EmailDeliveryState {
    return { ...this.state };
  }
}
