import { UpstreamUnavailableError } from "@meridian/nest-kit";
import { describe, expect, it } from "vitest";
import { ProviderRejectedError } from "../../application/ports";
import type { StripeSettings } from "../config/payment-settings";
import { type StripeApi, StripeTestProvider } from "./stripe-test.provider";

const settings: StripeSettings = {
  secretKey: "sk_test_unit",
  publishableKey: "pk_test_unit",
  webhookSecret: "whsec_unit",
  publicSiteUrl: "http://localhost:3100",
  timeoutMs: 2_000,
};

type Call = { method: string; args: unknown[] };

/** A fake Stripe client: records every call; `answer` decides each response. No network. */
function fakeStripe(answer: (call: Call) => unknown) {
  const calls: Call[] = [];
  const method =
    (name: string) =>
    async (...args: unknown[]) => {
      const call = { method: name, args };
      calls.push(call);
      const result = answer(call);
      if (result instanceof Error) throw result;
      return result;
    };
  const api = {
    paymentIntents: { create: method("paymentIntents.create"), retrieve: method("paymentIntents.retrieve"), confirm: method("paymentIntents.confirm"), cancel: method("paymentIntents.cancel") },
    refunds: { create: method("refunds.create") },
  } as unknown as StripeApi;
  return { api, calls };
}

/** Shaped like the SDK's StripeError subclasses (type, statusCode, code). */
const stripeError = (type: string, statusCode: number | undefined, code?: string) => Object.assign(new Error(`${type} ${code ?? ""}`), { type, statusCode, code });

const input = {
  paymentId: "pay_1",
  orderId: "ord_1",
  orderNumber: "M-ABCD1234",
  amountCents: 216_000,
  currency: "EUR" as const,
  customer: { email: "buyer@example.test", name: "Buyer" },
  lines: [{ name: "Holt", qty: 1, unitPriceCents: 216_000 }],
};

const refundInput = (over: Partial<Parameters<StripeTestProvider["refund"]>[0]> = {}) => ({
  paymentId: "pay_1",
  orderId: "ord_1",
  refundId: "ref_1",
  providerTransactionId: "pi_1",
  amountCents: 5_000,
  currency: "EUR" as const,
  reason: "damaged",
  full: false,
  ...over,
});

describe("StripeTestProvider", () => {
  it("refuses live keys at construction", () => {
    expect(() => new StripeTestProvider({ ...settings, secretKey: "sk_live_x" }, fakeStripe(() => ({})).api)).toThrow(/test secret key/);
    expect(() => new StripeTestProvider({ ...settings, publishableKey: "pk_live_x" }, fakeStripe(() => ({})).api)).toThrow(/publishable/);
    expect(() => new StripeTestProvider({ ...settings, secretKey: "rk_test_restricted" }, fakeStripe(() => ({})).api)).not.toThrow();
  });

  it("creates a EUR PaymentIntent in cents with metadata, receipt email and an idempotency key; never payment_method_types", async () => {
    const { api, calls } = fakeStripe(() => ({ id: "pi_1", client_secret: "pi_1_secret_abc", status: "requires_payment_method" }));
    const provider = new StripeTestProvider(settings, api);
    const created = await provider.createTransaction(input);
    expect(created).toEqual({ providerTransactionId: "pi_1", clientSecret: "pi_1_secret_abc" });
    const [params, options] = calls[0].args as [Record<string, unknown>, Record<string, unknown>];
    expect(calls[0].method).toBe("paymentIntents.create");
    expect(params).toMatchObject({
      amount: 216_000,
      currency: "eur",
      receipt_email: "buyer@example.test",
      description: "Meridian order M-ABCD1234",
      metadata: { paymentId: "pay_1", orderId: "ord_1", orderNumber: "M-ABCD1234" },
    });
    expect(params).not.toHaveProperty("payment_method_types");
    expect(options).toEqual({ idempotencyKey: "meridian-intent-pay_1" });
    expect(provider.clientToken()).toBe("pk_test_unit");
  });

  it("maps Stripe 4xx refusals to ProviderRejectedError and outages to UPSTREAM_UNAVAILABLE", async () => {
    const rejected = new StripeTestProvider(settings, fakeStripe(() => stripeError("StripeInvalidRequestError", 400, "amount_too_small")).api);
    await expect(rejected.createTransaction(input)).rejects.toMatchObject({ name: "ProviderRejectedError", provider: "stripe-test", providerCode: "amount_too_small" });
    const card = new StripeTestProvider(settings, fakeStripe(() => stripeError("StripeCardError", 402, "card_declined")).api);
    await expect(card.createTransaction(input)).rejects.toBeInstanceOf(ProviderRejectedError);
    const down = new StripeTestProvider(settings, fakeStripe(() => stripeError("StripeAPIError", 500)).api);
    await expect(down.createTransaction(input)).rejects.toBeInstanceOf(UpstreamUnavailableError);
    const limited = new StripeTestProvider(settings, fakeStripe(() => stripeError("StripeRateLimitError", 429, "rate_limit")).api);
    await expect(limited.createTransaction(input)).rejects.toBeInstanceOf(UpstreamUnavailableError);
    const offline = new StripeTestProvider(settings, fakeStripe(() => stripeError("StripeConnectionError", undefined)).api);
    await expect(offline.createTransaction(input)).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it("partial refund sends the amount; full refund lets Stripe refund what was captured; refundId is the idempotency key", async () => {
    const { api, calls } = fakeStripe(() => ({ id: "re_1", status: "succeeded" }));
    const provider = new StripeTestProvider(settings, api);
    expect(await provider.refund(refundInput())).toEqual({ status: "succeeded", providerRefundId: "re_1" });
    expect(calls[0].args[0]).toMatchObject({ payment_intent: "pi_1", amount: 5_000, metadata: { refundId: "ref_1", paymentId: "pay_1", orderId: "ord_1" } });
    expect(calls[0].args[1]).toEqual({ idempotencyKey: "meridian-refund-pay_1-ref_1" });
    await provider.refund(refundInput({ refundId: "ref_full", amountCents: 216_000, full: true }));
    expect(calls[1].args[0]).not.toHaveProperty("amount");
  });

  it("maps refund status: pending → submitted, failed → rejected; no PaymentIntent → rejected", async () => {
    const pending = new StripeTestProvider(settings, fakeStripe(() => ({ id: "re_p", status: "pending" })).api);
    expect(await pending.refund(refundInput())).toEqual({ status: "pending", providerRefundId: "re_p" });
    const failed = new StripeTestProvider(settings, fakeStripe(() => ({ id: "re_f", status: "failed", failure_reason: "expired_or_canceled_card" })).api);
    await expect(failed.refund(refundInput())).rejects.toMatchObject({ providerCode: "expired_or_canceled_card" });
    await expect(pending.refund(refundInput({ providerTransactionId: null }))).rejects.toMatchObject({ providerCode: "no_transaction" });
    const tooMuch = new StripeTestProvider(settings, fakeStripe(() => stripeError("StripeInvalidRequestError", 400, "charge_already_refunded")).api);
    await expect(tooMuch.refund(refundInput())).rejects.toBeInstanceOf(ProviderRejectedError);
  });

  it("cancels a PaymentIntent with an idempotency key and ignores one that is already terminal", async () => {
    const { api, calls } = fakeStripe(() => ({ id: "pi_1", status: "canceled" }));
    await new StripeTestProvider(settings, api).cancelTransaction("pi_1");
    expect(calls[0]).toMatchObject({ method: "paymentIntents.cancel", args: ["pi_1", { cancellation_reason: "abandoned" }, { idempotencyKey: "meridian-cancel-pi_1" }] });
    const terminal = new StripeTestProvider(settings, fakeStripe(() => stripeError("StripeInvalidRequestError", 400, "payment_intent_unexpected_state")).api);
    await expect(terminal.cancelTransaction("pi_1")).resolves.toBeUndefined();
    const other = new StripeTestProvider(settings, fakeStripe(() => stripeError("StripeInvalidRequestError", 404, "resource_missing")).api);
    await expect(other.cancelTransaction("pi_x")).rejects.toBeInstanceOf(ProviderRejectedError);
  });

  it("sandbox confirmation pays a waiting PaymentIntent with pm_card_visa and a return_url, and skips a paid one", async () => {
    let status = "requires_payment_method";
    const { api, calls } = fakeStripe((call) => (call.method === "paymentIntents.retrieve" ? { id: "pi_1", status, metadata: { paymentId: "pay_1" } } : { id: "pi_1", status: "succeeded" }));
    const provider = new StripeTestProvider(settings, api);
    await provider.confirmSandboxPayment({ paymentId: "pay_1", orderId: "ord_1", providerTransactionId: "pi_1" });
    const confirm = calls.find((c) => c.method === "paymentIntents.confirm")!;
    expect(confirm.args).toEqual(["pi_1", { payment_method: "pm_card_visa", return_url: "http://localhost:3100/orders/ord_1?paid=1" }, { idempotencyKey: "meridian-sandbox-confirm-pay_1" }]);
    status = "succeeded";
    await provider.confirmSandboxPayment({ paymentId: "pay_1", orderId: "ord_1", providerTransactionId: "pi_1" });
    expect(calls.filter((c) => c.method === "paymentIntents.confirm")).toHaveLength(1);
    await expect(provider.confirmSandboxPayment({ paymentId: "pay_other", orderId: "ord_1", providerTransactionId: "pi_1" })).rejects.toMatchObject({ providerCode: "payment_mismatch" });
  });

  it("returns the client secret of an existing PaymentIntent for intent replays", async () => {
    const provider = new StripeTestProvider(settings, fakeStripe(() => ({ id: "pi_1", client_secret: "pi_1_secret_again" })).api);
    expect(await provider.transactionClientSecret("pi_1")).toBe("pi_1_secret_again");
  });
});
