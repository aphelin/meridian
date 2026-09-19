import type { Payment, PaymentEvent } from "../../domain";
import type { OutboundMessage } from "../ports";

/**
 * Translates domain events into outbox messages: every event is published to Kafka, and the facts checkout must act on
 * also become commands (payment confirmed, refund recorded). Void refunds are internal and send no refund command.
 */
export function outboundMessages(events: readonly PaymentEvent[]): OutboundMessage[] {
  const messages: OutboundMessage[] = [];
  for (const event of events) {
    const aggregate = { type: event.aggregateType, id: event.aggregateId };
    switch (event.name) {
      case "PaymentSucceeded": {
        const { orderId, paymentId, transactionId, amountCents } = event.payload;
        messages.push({ kind: "event", name: event.name, aggregate, payload: event.payload });
        messages.push({ kind: "command", name: "checkout.confirm-payment", aggregate, payload: { orderId, paymentId, transactionId, amountCents } });
        break;
      }
      case "PaymentRefunded": {
        messages.push({ kind: "event", name: event.name, aggregate, payload: event.payload });
        if (event.context.refundKind === "refund") {
          const { orderId, refundId, amountCents } = event.payload;
          messages.push({
            kind: "command",
            name: "checkout.record-refund",
            aggregate,
            payload: { orderId, refundId, amountCents, status: "succeeded", reason: event.context.refundReason ?? null },
          });
        }
        break;
      }
      case "RefundFailed": {
        messages.push({ kind: "event", name: event.name, aggregate, payload: event.payload });
        if (event.context.refundKind === "refund") {
          const { orderId, refundId, reason } = event.payload;
          messages.push({
            kind: "command",
            name: "checkout.record-refund",
            aggregate,
            payload: { orderId, refundId, amountCents: event.context.refundAmountCents ?? 0, status: "failed", reason },
          });
        }
        break;
      }
      case "PaymentFailed":
        messages.push({ kind: "event", name: event.name, aggregate, payload: event.payload });
        break;
      case "PaymentVoided":
        messages.push({ kind: "event", name: event.name, aggregate, payload: event.payload });
        break;
    }
  }
  return messages;
}

/**
 * Outbox messages for a changed payment: its events plus, when a voided payment still owes the customer money that no
 * worker is refunding, a `payment.void` command to itself so the refund is dispatched with RabbitMQ retries.
 */
export function messagesFor(payment: Payment, { scheduleVoidRefunds = true } = {}): OutboundMessage[] {
  const messages = outboundMessages(payment.pullEvents());
  if (scheduleVoidRefunds && payment.status === "voided" && payment.refundsAwaitingDispatch().length) {
    messages.push({
      kind: "command",
      name: "payment.void",
      aggregate: { type: "Payment", id: payment.id },
      payload: { orderId: payment.orderId, transactionId: payment.transactionId, reason: "Refund captured money of a voided payment" },
    });
  }
  return messages;
}
