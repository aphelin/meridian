import { DomainError } from "@meridian/kernel";
import { Inject, Injectable } from "@nestjs/common";
import Stripe from "stripe";
import { StripeWebhookVerifier, type VerifiedStripeEvent } from "../../application/ports";
import { PAYMENT_CONFIG, type PaymentConfig } from "../config/payment-settings";

/** Events older than this (by the signed timestamp) are refused as replays. Stripe's own default. */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verifies the Stripe-Signature header with the Stripe SDK (`webhooks.constructEvent`: HMAC-SHA256 over the raw body,
 * 5 minute tolerance, several v1 signatures allowed during secret rotation). No secret configured → every call refused.
 */
@Injectable()
export class StripeSignatureVerifier extends StripeWebhookVerifier {
  private readonly secret: string | null;

  constructor(@Inject(PAYMENT_CONFIG) config: Pick<PaymentConfig, "stripe">) {
    super();
    this.secret = config.stripe?.webhookSecret ?? null;
  }

  verify(rawBody: Buffer | undefined, signatureHeader: string | undefined, now: Date): VerifiedStripeEvent {
    if (!this.secret || !rawBody || !signatureHeader || signatureHeader.length > 4000) throw invalid();
    let event: { id?: unknown; type?: unknown; data?: { object?: unknown } };
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signatureHeader, this.secret, STRIPE_SIGNATURE_TOLERANCE_SECONDS, undefined, now.getTime());
    } catch {
      throw invalid();
    }
    const object = event.data?.object;
    if (typeof event.id !== "string" || typeof event.type !== "string" || !object || typeof object !== "object") {
      throw new DomainError("VALIDATION_FAILED", "Webhook body is not a Stripe event.");
    }
    return { id: event.id, type: event.type, data: { object: object as Record<string, unknown> } };
  }
}

const invalid = () => new DomainError("UNAUTHORIZED", "Invalid webhook signature.");
