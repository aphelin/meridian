import type { Cents, SkuQty } from "./common";
import type { EmailTemplate } from "./events";
import type { MessageEnvelope } from "./messaging";

export const Commands = {
  SendEmail: "notification.send-email",
  ConfirmOrderPayment: "checkout.confirm-payment",
  RecordRefund: "checkout.record-refund",
  GenerateInvoice: "checkout.generate-invoice",
  RefundPayment: "payment.refund",
  VoidPayment: "payment.void",
  ReleaseReservation: "inventory.release-reservation",
  RestockItems: "inventory.restock",
} as const;
export type CommandName = (typeof Commands)[keyof typeof Commands];

/** Which service consumes each command queue. */
export const CommandOwner: Record<CommandName, string> = {
  "notification.send-email": "notification-service",
  "checkout.confirm-payment": "checkout-service",
  "checkout.record-refund": "checkout-service",
  "checkout.generate-invoice": "checkout-service",
  "payment.refund": "payment-service",
  "payment.void": "payment-service",
  "inventory.release-reservation": "inventory-service",
  "inventory.restock": "inventory-service",
};

export interface CommandPayloads {
  "notification.send-email": {
    template: EmailTemplate;
    to: { email: string; name: string | null };
    /** Template variables; every template documents its keys in notification-service. */
    data: Record<string, unknown>;
    /** Deliveries with the same key are sent at most once. */
    dedupeKey: string;
  };
  "checkout.confirm-payment": { orderId: string; paymentId: string; transactionId: string; amountCents: Cents };
  "checkout.record-refund": { orderId: string; refundId: string; amountCents: Cents; status: "succeeded" | "failed"; reason: string | null };
  "checkout.generate-invoice": { orderId: string };
  "payment.refund": { orderId: string; refundId: string; amountCents: Cents; reason: string; returnId: string | null };
  "payment.void": { orderId: string; transactionId: string; reason: string };
  "inventory.release-reservation": { orderId: string; reason: "cancelled" | "expired" | "payment-failed" };
  "inventory.restock": { orderId: string; returnId: string | null; lines: SkuQty[] };
}

export type CommandEnvelope<N extends CommandName = CommandName> = MessageEnvelope<N, CommandPayloads[N]>;
