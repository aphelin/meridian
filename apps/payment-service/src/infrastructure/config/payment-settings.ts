import { assertSandboxPayments, envInt, SandboxOnlyError } from "@meridian/nest-kit";
import type { PaymentSettings } from "../../application/ports";

export const PADDLE_SANDBOX_API = "https://sandbox-api.paddle.com";

export interface PaddleSettings {
  apiKey: string;
  clientToken: string;
  baseUrl: string;
  timeoutMs: number;
}

export interface StripeSettings {
  /** sk_test_ or rk_test_ only (live keys refuse to start). */
  secretKey: string;
  /** pk_test_ only; handed to the storefront's Payment Element with each intent. */
  publishableKey: string;
  /** whsec_ signing secret of the webhook endpoint or of `stripe listen`; null → every Stripe webhook is refused. */
  webhookSecret: string | null;
  /** Where Payment Element redirect-based methods (and the test-mode shortcut) return the shopper to. */
  publicSiteUrl: string;
  timeoutMs: number;
}

/** stripe: Stripe test mode (default when STRIPE_SECRET_KEY is set); paddle: Paddle sandbox (retained adapter); local: no provider. */
export type ActiveProvider = "stripe" | "paddle" | "local";

export interface PaymentConfig extends PaymentSettings {
  /** Which provider takes new intents. */
  provider: ActiveProvider;
  /** Null → the Paddle adapter is not available. */
  paddle: PaddleSettings | null;
  /** Null → the Stripe adapter is not available. */
  stripe: StripeSettings | null;
  /** Paddle notification secret. */
  webhookSecret: string | null;
}

const value = (env: NodeJS.ProcessEnv, name: string) => env[name]?.trim() || undefined;

const STRIPE_KEY_VARIABLES = ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"];

/**
 * Stripe is test mode only: any live key (sk_live_, rk_live_, pk_live_) in any Stripe variable refuses to start, the
 * secret key must be a test key (sk_test_ or a restricted rk_test_) and publishable keys must be pk_test_.
 */
export function assertStripeTestMode(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of STRIPE_KEY_VARIABLES) {
    const key = value(env, name);
    if (key && /_live_/.test(key)) throw new SandboxOnlyError(`${name} is a live Stripe key; Meridian only runs Stripe in test mode`);
  }
  const secret = value(env, "STRIPE_SECRET_KEY");
  if (secret && !/^(sk|rk)_test_/.test(secret)) throw new SandboxOnlyError("STRIPE_SECRET_KEY is not a Stripe test key (expected prefix sk_test_ or rk_test_)");
  for (const name of ["STRIPE_PUBLISHABLE_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]) {
    const key = value(env, name);
    if (key && !key.startsWith("pk_test_")) throw new SandboxOnlyError(`${name} is not a Stripe test publishable key (expected prefix pk_test_)`);
  }
}

/**
 * Reads payment configuration and enforces the sandbox-only rule (throws SandboxOnlyError): Stripe only with test keys;
 * Paddle only with PADDLE_ENV=sandbox, a pdl_sdbx_ API key and a test_ client token, against the fixed sandbox API (the
 * base URL can be overridden only when NODE_ENV=test, for contract probes against a local stub).
 *
 * The active provider is PAYMENT_PROVIDER (stripe | paddle | local) or, when unset: Stripe if STRIPE_SECRET_KEY is set,
 * else Paddle if configured, else the local sandbox.
 */
export function loadPaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  assertSandboxPayments(env);
  assertStripeTestMode(env);

  const apiKey = value(env, "PADDLE_API_KEY");
  let paddle: PaddleSettings | null = null;
  if (apiKey) {
    const clientToken = value(env, "PADDLE_CLIENT_TOKEN");
    if (!clientToken) throw new Error("PADDLE_CLIENT_TOKEN is required when PADDLE_API_KEY is set");
    const override = value(env, "PADDLE_API_BASE_URL");
    paddle = {
      apiKey,
      clientToken,
      baseUrl: (env.NODE_ENV === "test" && override ? override : PADDLE_SANDBOX_API).replace(/\/+$/, ""),
      timeoutMs: 5_000,
    };
  }

  const secretKey = value(env, "STRIPE_SECRET_KEY");
  let stripe: StripeSettings | null = null;
  if (secretKey) {
    const publishableKey = value(env, "STRIPE_PUBLISHABLE_KEY") ?? value(env, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    if (!publishableKey) throw new Error("STRIPE_PUBLISHABLE_KEY is required when STRIPE_SECRET_KEY is set");
    stripe = {
      secretKey,
      publishableKey,
      webhookSecret: value(env, "STRIPE_WEBHOOK_SECRET") ?? null,
      publicSiteUrl: (value(env, "PUBLIC_SITE_URL") ?? "http://localhost:3100").replace(/\/+$/, ""),
      timeoutMs: envInt("STRIPE_TIMEOUT_MS", 10_000, { min: 1_000, env }),
    };
  }

  const requested = value(env, "PAYMENT_PROVIDER")?.toLowerCase();
  let provider: ActiveProvider;
  if (requested === undefined) provider = stripe ? "stripe" : paddle ? "paddle" : "local";
  else if (requested === "stripe" || requested === "paddle" || requested === "local") provider = requested;
  else throw new Error(`PAYMENT_PROVIDER must be stripe, paddle or local (got "${requested}")`);
  if (provider === "stripe" && !stripe) throw new Error("PAYMENT_PROVIDER=stripe needs STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY");
  if (provider === "paddle" && !paddle) throw new Error("PAYMENT_PROVIDER=paddle needs PADDLE_API_KEY and PADDLE_CLIENT_TOKEN");

  return {
    provider,
    paddle,
    stripe,
    webhookSecret: value(env, "PADDLE_WEBHOOK_SECRET") ?? null,
    refundDispatchLeaseMs: envInt("REFUND_DISPATCH_LEASE_MS", 30_000, { min: 1_000, env }),
  };
}

export const PAYMENT_CONFIG = Symbol("PAYMENT_CONFIG");
