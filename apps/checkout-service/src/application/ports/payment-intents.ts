import type { CreateIntentRequest, PaymentIntentDto } from "@meridian/contracts";

export abstract class PaymentIntents {
  /** Idempotent per order id. */
  abstract createIntent(request: CreateIntentRequest): Promise<PaymentIntentDto>;
}
