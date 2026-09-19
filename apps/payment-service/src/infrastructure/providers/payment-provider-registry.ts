import type { PaymentProviderId } from "@meridian/contracts";
import { createLogger } from "@meridian/nest-kit";
import { Inject, Injectable } from "@nestjs/common";
import { type PaymentProvider, PaymentProviders } from "../../application/ports";
import { PAYMENT_CONFIG, type PaymentConfig } from "../config/payment-settings";
import { LocalSandboxProvider } from "./local-sandbox.provider";
import { PaddleSandboxProvider } from "./paddle-sandbox.provider";
import { StripeTestProvider } from "./stripe-test.provider";

const log = createLogger("PaymentProviders");

/**
 * Every configured provider stays available for refunds and webhooks of the payments it took; `config.provider` picks
 * the one that takes new intents (Stripe test mode by default when its keys are set). The local sandbox is always
 * available so old local payments can still be refunded.
 */
@Injectable()
export class PaymentProviderRegistry extends PaymentProviders {
  private readonly local = new LocalSandboxProvider();
  private readonly paddle: PaddleSandboxProvider | null;
  private readonly stripe: StripeTestProvider | null;
  private readonly current: PaymentProvider;

  constructor(@Inject(PAYMENT_CONFIG) config: PaymentConfig) {
    super();
    this.paddle = config.paddle ? new PaddleSandboxProvider(config.paddle) : null;
    this.stripe = config.stripe ? new StripeTestProvider(config.stripe) : null;
    this.current = (config.provider === "stripe" ? this.stripe : config.provider === "paddle" ? this.paddle : null) ?? this.local;
    log.info("payment provider selected", {
      provider: this.current.id,
      sandbox: true,
      available: [this.local.id, this.paddle?.id, this.stripe?.id].filter(Boolean),
      stripeWebhooks: config.stripe ? Boolean(config.stripe.webhookSecret) : undefined,
    });
    if (config.stripe && !config.stripe.webhookSecret) log.warn("STRIPE_WEBHOOK_SECRET is not set: Stripe payments will never be marked paid (run `npm run stripe:listen`)");
  }

  active(): PaymentProvider {
    return this.current;
  }

  get(id: PaymentProviderId): PaymentProvider | null {
    if (id === "local-sandbox") return this.local;
    if (id === "paddle-sandbox") return this.paddle;
    if (id === "stripe-test") return this.stripe;
    return null;
  }
}
