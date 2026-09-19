import type { PaymentIntentDto } from "@meridian/contracts";
import type { Payment } from "../domain";

export interface IntentSecrets {
  /** Meridian's sandbox-completion secret (local sandbox, Stripe test shortcut). */
  clientSecret: string | null;
  /** Public provider configuration: Paddle client token or Stripe publishable key. */
  clientToken: string | null;
  /** Stripe PaymentIntent client_secret. */
  providerClientSecret: string | null;
}

export function toIntentDto(payment: Payment, secrets: IntentSecrets): PaymentIntentDto {
  const paddle =
    payment.provider === "paddle-sandbox" && payment.providerTransactionId && secrets.clientToken
      ? { transactionId: payment.providerTransactionId, clientToken: secrets.clientToken, environment: "sandbox" as const }
      : null;
  const stripe =
    payment.provider === "stripe-test" && secrets.providerClientSecret && secrets.clientToken
      ? { clientSecret: secrets.providerClientSecret, publishableKey: secrets.clientToken }
      : null;
  return {
    paymentId: payment.id,
    transactionId: payment.transactionId,
    provider: payment.provider,
    status: payment.status,
    clientSecret: payment.clientSecretHash ? secrets.clientSecret : null,
    paddle,
    stripe,
  };
}
