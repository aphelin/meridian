/** Authenticates a provider webhook. Throws UNAUTHORIZED (DomainError) when the signature is missing, wrong or stale. */
export abstract class WebhookVerifier {
  abstract verify(rawBody: Buffer | undefined, signatureHeader: string | undefined, now: Date): void;
}

/** A Stripe event whose signature was verified; only the fields Meridian reads. */
export interface VerifiedStripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Authenticates a Stripe webhook (Stripe-Signature header, verified with the Stripe SDK against STRIPE_WEBHOOK_SECRET)
 * and returns the event. Throws UNAUTHORIZED (DomainError) when the signature is missing, wrong or stale.
 */
export abstract class StripeWebhookVerifier {
  abstract verify(rawBody: Buffer | undefined, signatureHeader: string | undefined, now: Date): VerifiedStripeEvent;
}
