import type { Cents, CurrencyCode, IsoDateTime } from "../common";
import type { PaymentProviderId } from "../events";

export interface CreateIntentRequest {
  orderId: string;
  orderNumber: string;
  amountCents: Cents;
  currency: CurrencyCode;
  customer: { email: string; name: string };
  lines: { name: string; qty: number; unitPriceCents: Cents }[];
}

export interface PaymentIntentDto {
  paymentId: string;
  transactionId: string;
  provider: PaymentProviderId;
  status: PaymentStatus;
  /**
   * Meridian's own secret that authorises sandbox completion (POST /payments/:transactionId/sandbox-complete) for the
   * session that placed the order: the local sandbox "pay" button, and the Stripe test-mode shortcut used by tests.
   * Null for Paddle.
   */
  clientSecret: string | null;
  /** Paddle sandbox only (retained second adapter). */
  paddle: { transactionId: string; clientToken: string; environment: "sandbox" } | null;
  /**
   * Stripe test mode only: the PaymentIntent client secret and publishable key the storefront's Payment Element needs.
   * Optional so older producers (and test doubles) that predate Stripe still type-check; payment-service always sets it.
   */
  stripe?: { clientSecret: string; publishableKey: string } | null;
}

export type PaymentStatus = "pending" | "succeeded" | "failed" | "voided" | "refunded" | "partially_refunded";

export interface PaymentSummaryDto {
  paymentId: string;
  transactionId: string;
  provider: PaymentProviderId;
  status: PaymentStatus;
  amountCents: Cents;
  refundedCents: Cents;
  createdAt: IsoDateTime;
  refunds: { refundId: string; amountCents: Cents; status: "pending" | "succeeded" | "failed"; createdAt: IsoDateTime }[];
}
