import type { Cents, CreateIntentRequest, CurrencyCode, PaymentProviderId } from "@meridian/contracts";

export interface ProviderTransactionInput {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amountCents: Cents;
  currency: CurrencyCode;
  customer: CreateIntentRequest["customer"];
  lines: CreateIntentRequest["lines"];
}

export interface ProviderRefundInput {
  paymentId: string;
  orderId: string;
  refundId: string;
  providerTransactionId: string | null;
  amountCents: Cents;
  currency: CurrencyCode;
  reason: string;
  /** True when this refund returns the whole captured amount in one go. */
  full: boolean;
}

export type ProviderRefundResult = { status: "succeeded"; providerRefundId: string | null } | { status: "pending"; providerRefundId: string };

/** The provider answered and definitively refused (4xx). Retrying the same request cannot succeed. */
export class ProviderRejectedError extends Error {
  constructor(
    readonly provider: PaymentProviderId,
    message: string,
    readonly providerCode: string | null = null,
  ) {
    super(message);
    this.name = "ProviderRejectedError";
  }
}

export interface ProviderTransaction {
  providerTransactionId: string;
  /** Browser-side secret for the provider's own payment UI (Stripe PaymentIntent client_secret). */
  clientSecret?: string;
}

export interface SandboxConfirmationInput {
  paymentId: string;
  orderId: string;
  providerTransactionId: string;
}

/**
 * A payment service provider. Every implementation is sandbox/test mode only; adapters bound every call with a timeout
 * and a circuit breaker and throw ProviderRejectedError for definitive refusals (anything else is transient).
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /**
   * POST /payments/:transactionId/sandbox-complete is available, authorised by Meridian's client secret. The local
   * sandbox settles the payment directly; a provider with `confirmSandboxPayment` confirms it with a test payment
   * method instead and the signed webhook settles it.
   */
  readonly supportsSandboxCompletion: boolean;
  /** Creates the provider-side transaction; null when the provider has none (local sandbox). */
  createTransaction(input: ProviderTransactionInput): Promise<ProviderTransaction | null>;
  /** The browser-side secret of an existing provider transaction (intent replays); absent when the provider has none. */
  transactionClientSecret?(providerTransactionId: string): Promise<string | null>;
  /** Test mode only: pays the provider transaction with a test payment method, as a shopper would. */
  confirmSandboxPayment?(input: SandboxConfirmationInput): Promise<void>;
  refund(input: ProviderRefundInput): Promise<ProviderRefundResult>;
  /** Best effort: stop an uncaptured provider transaction from being paid. */
  cancelTransaction(providerTransactionId: string): Promise<void>;
  /** Public client configuration for the storefront (Paddle client token, Stripe publishable key); null for the local sandbox. */
  clientToken(): string | null;
}

/** The providers this process can talk to; `active` takes new intents. */
export abstract class PaymentProviders {
  abstract active(): PaymentProvider;
  abstract get(id: PaymentProviderId): PaymentProvider | null;
}
