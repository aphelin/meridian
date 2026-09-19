import type { Cents, EventPayloads } from "@meridian/contracts";
import type { DomainEvent } from "@meridian/kernel";

export type PaymentEventName = "PaymentSucceeded" | "PaymentFailed" | "PaymentVoided" | "PaymentRefunded" | "RefundFailed";

/** Why a refund exists: requested by checkout (`refund`) or recorded while voiding a captured payment (`void`). */
export type RefundKind = "refund" | "void";

/** Facts that are not part of the public event payload but decide follow-up commands. */
export interface PaymentEventContext {
  refundKind?: RefundKind;
  refundReason?: string;
  refundAmountCents?: Cents;
}

export type PaymentEvent = {
  [N in PaymentEventName]: DomainEvent<N, EventPayloads[N]> & { readonly context: PaymentEventContext };
}[PaymentEventName];

export const PAYMENT_AGGREGATE = "Payment";

export function paymentEvent<N extends PaymentEventName>(
  name: N,
  aggregateId: string,
  payload: EventPayloads[N],
  occurredAt: Date,
  context: PaymentEventContext = {},
): PaymentEvent {
  return { name, aggregateType: PAYMENT_AGGREGATE, aggregateId, payload, occurredAt, context } as PaymentEvent;
}
