import { createBreaker, createLogger, type KitBreaker, UpstreamUnavailableError } from "@meridian/nest-kit";
import Stripe from "stripe";
import {
  type PaymentProvider,
  type ProviderRefundInput,
  type ProviderRefundResult,
  ProviderRejectedError,
  type ProviderTransaction,
  type ProviderTransactionInput,
  type SandboxConfirmationInput,
} from "../../application/ports";
import type { StripeSettings } from "../config/payment-settings";

/** Pinned so a Stripe account upgrade never changes what this adapter receives. */
export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

/** The part of the Stripe client this adapter uses (unit tests inject a fake). */
export type StripeApi = Pick<Stripe, "paymentIntents" | "refunds">;

const log = createLogger("StripeTest");
const PROVIDER = "stripe-test" as const;
/** A PaymentIntent in one of these states can no longer be paid or cancelled. */
const TERMINAL = new Set(["succeeded", "canceled"]);

/** Builds the Stripe client: always an instance (never the global key), pinned API version, SDK timeout, one retry. */
export function createStripeClient(settings: Pick<StripeSettings, "secretKey" | "timeoutMs">): Stripe {
  return new Stripe(settings.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    timeout: settings.timeoutMs,
    // Every mutating call carries an idempotency key, so the SDK's retry cannot charge or refund twice.
    maxNetworkRetries: 1,
    appInfo: { name: "meridian-payment-service" },
  });
}

/**
 * Stripe test-mode adapter: PaymentIntents + the storefront's Payment Element. Test keys only (guarded at startup and
 * here), dynamic payment methods (the Dashboard decides; no method list is ever sent), idempotency keys on every create, refund and
 * cancel. Every call runs through the "stripe" circuit breaker (chaos target "stripe.api"); 4xx answers other than
 * 408/429 are definitive refusals (ProviderRejectedError) and do not trip the breaker.
 */
export class StripeTestProvider implements PaymentProvider {
  readonly id = PROVIDER;
  readonly supportsSandboxCompletion = true;
  private readonly breaker: KitBreaker<[string, () => Promise<unknown>], unknown>;

  constructor(
    private readonly settings: StripeSettings,
    private readonly stripe: StripeApi = createStripeClient(settings),
  ) {
    if (!/^(sk|rk)_test_/.test(settings.secretKey)) throw new Error("StripeTestProvider requires a Stripe test secret key (sk_test_ or rk_test_)");
    if (!settings.publishableKey.startsWith("pk_test_")) throw new Error("StripeTestProvider requires a Stripe test publishable key (pk_test_)");
    this.breaker = createBreaker("stripe", "stripe.api", (operation: string, work: () => Promise<unknown>) => this.send(operation, work), {
      timeoutMs: settings.timeoutMs * 2 + 1_000,
      isNeutral: (error) => error instanceof ProviderRejectedError,
    });
  }

  clientToken() {
    return this.settings.publishableKey;
  }

  async createTransaction(input: ProviderTransactionInput): Promise<ProviderTransaction> {
    const intent = await this.call("paymentIntents.create", () =>
      this.stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          description: `Meridian order ${input.orderNumber}`,
          receipt_email: input.customer.email,
          metadata: { paymentId: input.paymentId, orderId: input.orderId, orderNumber: input.orderNumber },
        },
        // One PaymentIntent per Meridian payment, even when two intent requests race.
        { idempotencyKey: `meridian-intent-${input.paymentId}` },
      ),
    );
    if (!intent.id || !intent.client_secret) {
      throw new UpstreamUnavailableError("stripe", "network", { cause: new Error("Stripe created a PaymentIntent without an id or client secret") });
    }
    return { providerTransactionId: intent.id, clientSecret: intent.client_secret };
  }

  async transactionClientSecret(providerTransactionId: string): Promise<string | null> {
    const intent = await this.call("paymentIntents.retrieve", () => this.stripe.paymentIntents.retrieve(providerTransactionId));
    return intent.client_secret ?? null;
  }

  /** Test mode shortcut behind sandbox-complete: pays the PaymentIntent with the pm_card_visa test card; the webhook settles it. */
  async confirmSandboxPayment(input: SandboxConfirmationInput): Promise<void> {
    const intent = await this.call("paymentIntents.retrieve", () => this.stripe.paymentIntents.retrieve(input.providerTransactionId));
    if (intent.metadata?.paymentId && intent.metadata.paymentId !== input.paymentId) {
      throw new ProviderRejectedError(PROVIDER, "The PaymentIntent belongs to another payment.", "payment_mismatch");
    }
    if (TERMINAL.has(intent.status) || intent.status === "processing") return;
    await this.call("paymentIntents.confirm", () =>
      this.stripe.paymentIntents.confirm(
        input.providerTransactionId,
        {
          payment_method: "pm_card_visa",
          return_url: `${this.settings.publicSiteUrl}/orders/${encodeURIComponent(input.orderId)}?paid=1`,
        },
        { idempotencyKey: `meridian-sandbox-confirm-${input.paymentId}` },
      ),
    );
  }

  async refund(input: ProviderRefundInput): Promise<ProviderRefundResult> {
    if (!input.providerTransactionId) throw new ProviderRejectedError(PROVIDER, "The payment has no Stripe PaymentIntent to refund.", "no_transaction");
    const paymentIntent = input.providerTransactionId;
    const refund = await this.call("refunds.create", () =>
      this.stripe.refunds.create(
        {
          payment_intent: paymentIntent,
          // A full refund omits the amount so Stripe returns exactly what was captured.
          ...(input.full ? {} : { amount: input.amountCents }),
          reason: "requested_by_customer",
          metadata: { paymentId: input.paymentId, orderId: input.orderId, refundId: input.refundId, reason: input.reason.slice(0, 450) },
        },
        // Meridian's refundId is the idempotency key: a redelivered payment.refund never refunds twice.
        { idempotencyKey: `meridian-refund-${input.paymentId}-${input.refundId}` },
      ),
    );
    switch (refund.status) {
      case "succeeded":
        return { status: "succeeded", providerRefundId: refund.id };
      case "failed":
      case "canceled":
        throw new ProviderRejectedError(PROVIDER, `Stripe could not refund the payment (${refund.status}).`, refund.failure_reason ?? `refund_${refund.status}`);
      default:
        // pending / requires_action: settled later by refund.updated / charge.refund.updated webhooks.
        return { status: "pending", providerRefundId: refund.id };
    }
  }

  async cancelTransaction(providerTransactionId: string): Promise<void> {
    try {
      await this.call("paymentIntents.cancel", () =>
        this.stripe.paymentIntents.cancel(providerTransactionId, { cancellation_reason: "abandoned" }, { idempotencyKey: `meridian-cancel-${providerTransactionId}` }),
      );
    } catch (error) {
      // Already succeeded or canceled: nothing left to stop (a late capture is refunded through the webhook).
      if (error instanceof ProviderRejectedError && error.providerCode === "payment_intent_unexpected_state") {
        log.info("stripe PaymentIntent already terminal; nothing to cancel", { providerTransactionId });
        return;
      }
      throw error;
    }
  }

  private async call<T>(operation: string, work: () => Promise<T>): Promise<T> {
    return (await this.breaker.fire(operation, work)) as T;
  }

  private async send(operation: string, work: () => Promise<unknown>): Promise<unknown> {
    try {
      return await work();
    } catch (error) {
      throw translate(operation, error);
    }
  }
}

/** Stripe SDK error → ProviderRejectedError (definitive 4xx) or UpstreamUnavailableError (retry later). Never logs keys. */
export function translate(operation: string, error: unknown): Error {
  if (error instanceof ProviderRejectedError || error instanceof UpstreamUnavailableError) return error;
  const e = (error ?? {}) as { type?: unknown; statusCode?: unknown; code?: unknown; decline_code?: unknown; message?: unknown };
  const type = typeof e.type === "string" ? e.type : null;
  const status = typeof e.statusCode === "number" ? e.statusCode : null;
  const code = typeof e.code === "string" ? e.code : typeof e.decline_code === "string" ? e.decline_code : null;
  if (type && type.startsWith("Stripe")) {
    log.warn("stripe api error", { operation, type, status, code });
    const refused = type === "StripeCardError" || type === "StripeInvalidRequestError" || type === "StripeIdempotencyError";
    if (refused || (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429 && type !== "StripeRateLimitError")) {
      return new ProviderRejectedError(PROVIDER, `Stripe refused the request${status ? ` (${status})` : ""}.`, code ?? type);
    }
    const timeout = type === "StripeConnectionError" && typeof e.message === "string" && /timed? ?out/i.test(e.message);
    return new UpstreamUnavailableError("stripe", timeout ? "timeout" : "network", { cause: error });
  }
  const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  return new UpstreamUnavailableError("stripe", timeout ? "timeout" : "network", { cause: error });
}
