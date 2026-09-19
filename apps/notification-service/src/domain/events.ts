import type { EmailTemplate, EventPayloads } from "@meridian/contracts";
import type { DomainEvent } from "@meridian/kernel";

export type NotificationEventName = "EmailSent" | "EmailDeadLettered";

/** A domain event of the notification bounded context, typed by the frozen contract payloads. */
export type NotificationEvent = { [N in NotificationEventName]: DomainEvent<N, EventPayloads[N]> }[NotificationEventName];

export const EmailDeliveryAggregate = "EmailDelivery";

export const EMAIL_TEMPLATES = [
  "verify-email",
  "password-reset",
  "password-changed",
  "account-deleted",
  "order-confirmation",
  "order-shipped",
  "order-delivered",
  "order-cancelled",
  "order-refunded",
  "return-received",
  "return-approved",
  "return-rejected",
  "invoice-issued",
  "newsletter-confirm",
  "newsletter-welcome",
  "contact-received",
  "contact-internal",
  "back-in-stock",
] as const satisfies readonly EmailTemplate[];

// Compile-time check that the list covers every contract template.
type Missing = Exclude<EmailTemplate, (typeof EMAIL_TEMPLATES)[number]>;
const _complete: Missing extends never ? true : Missing = true;
void _complete;

export function isEmailTemplate(value: unknown): value is EmailTemplate {
  return typeof value === "string" && (EMAIL_TEMPLATES as readonly string[]).includes(value);
}
