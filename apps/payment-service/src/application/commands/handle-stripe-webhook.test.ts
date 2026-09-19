import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { StripeSignatureVerifier } from "../../infrastructure/providers/stripe-webhook-verifier";
import { FakeProvider, FakeProviders, InMemoryUnitOfWork, PlainClientSecrets, settings, testClock } from "../../test-support/in-memory";
import { RefundDispatcher } from "../services/refund-dispatcher";
import {
  CompleteSandboxPaymentCommand,
  CompleteSandboxPaymentHandler,
  CreatePaymentIntentCommand,
  CreatePaymentIntentHandler,
  HandleStripeWebhookCommand,
  HandleStripeWebhookHandler,
  RefundPaymentCommand,
  RefundPaymentHandler,
  VoidPaymentCommand,
  VoidPaymentHandler,
} from "./index";

const SECRET = "whsec_handler_test";

const request = (orderId = "ord_1", amountCents = 216_000) => ({
  orderId,
  orderNumber: "M-ABCD1234",
  amountCents,
  currency: "EUR" as const,
  customer: { email: "buyer@example.test", name: "Buyer" },
  lines: [{ name: "Holt", qty: 1, unitPriceCents: amountCents }],
});

function setup() {
  const uow = new InMemoryUnitOfWork();
  const providers = new FakeProviders(new FakeProvider("local-sandbox"), null, new FakeProvider("stripe-test"));
  const secrets = new PlainClientSecrets();
  const clock = testClock();
  const verifier = new StripeSignatureVerifier({ stripe: { webhookSecret: SECRET } as never });
  const dispatcher = new RefundDispatcher(uow, providers, clock, settings);
  const nowSec = Math.floor(clock.now().getTime() / 1000);
  let counter = 0;
  /** A Stripe event signed exactly as Stripe (or `stripe listen`) signs it. */
  const event = (type: string, object: Record<string, unknown>, id = `evt_${++counter}`) => {
    const body = JSON.stringify({ id, object: "event", type, data: { object } });
    return new HandleStripeWebhookCommand(Buffer.from(body), Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET, timestamp: nowSec }));
  };
  return {
    uow,
    stripe: providers.stripe!,
    event,
    intent: new CreatePaymentIntentHandler(uow, providers, secrets, clock),
    complete: new CompleteSandboxPaymentHandler(uow, providers, secrets, clock),
    webhook: new HandleStripeWebhookHandler(uow, verifier, clock),
    refund: new RefundPaymentHandler(uow, dispatcher, clock),
    void: new VoidPaymentHandler(uow, providers, dispatcher, clock),
  };
}

const pi = (paymentId: string, over: Record<string, unknown> = {}) => ({
  id: "pi_fake_1",
  object: "payment_intent",
  amount: 216_000,
  currency: "eur",
  status: "succeeded",
  metadata: { paymentId, orderId: "ord_1", orderNumber: "M-ABCD1234" },
  ...over,
});

describe("Stripe intents", () => {
  it("creates one PaymentIntent per order and hands the Payment Element its client secret and publishable key", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    expect(intent).toMatchObject({ provider: "stripe-test", status: "pending", paddle: null, stripe: { clientSecret: "pi_fake_1_secret_fake", publishableKey: "pk_test_fake" } });
    expect(intent.clientSecret).toBeTruthy();
    const replay = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    expect(replay).toEqual(intent);
    expect(s.stripe.createCalls).toHaveLength(1);
    expect(s.uow.payment("ord_1")?.providerTransactionId).toBe("pi_fake_1");
  });

  it("sandbox-complete confirms the PaymentIntent with a test card but leaves settlement to the webhook", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    await expect(s.complete.execute(new CompleteSandboxPaymentCommand(intent.transactionId, "wrong"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const result = await s.complete.execute(new CompleteSandboxPaymentCommand(intent.transactionId, intent.clientSecret!));
    expect(result.status).toBe("pending");
    expect(s.stripe.confirmCalls).toEqual([{ paymentId: intent.paymentId, orderId: "ord_1", providerTransactionId: "pi_fake_1" }]);
    expect(s.uow.messages("PaymentSucceeded")).toHaveLength(0);
  });
});

describe("HandleStripeWebhook", () => {
  it("payment_intent.succeeded settles once (PaymentSucceeded + checkout.confirm-payment); a replayed event is a duplicate", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    const cmd = s.event("payment_intent.succeeded", pi(intent.paymentId), "evt_paid");
    expect(await s.webhook.execute(cmd)).toEqual({ received: true, outcome: "processed" });
    expect(await s.webhook.execute(cmd)).toEqual({ received: true, outcome: "duplicate" });
    expect((await s.webhook.execute(s.event("payment_intent.succeeded", pi(intent.paymentId)))).outcome).toBe("ignored");
    expect(s.uow.payment("ord_1")?.status).toBe("succeeded");
    expect(s.uow.messages("checkout.confirm-payment")).toHaveLength(1);
    expect(s.uow.messages("PaymentSucceeded")[0].payload).toMatchObject({ provider: "stripe-test", orderId: "ord_1", amountCents: 216_000 });
  });

  it("an event with a bad signature changes nothing and is UNAUTHORIZED", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    const body = JSON.stringify({ id: "evt_forged", object: "event", type: "payment_intent.succeeded", data: { object: pi(intent.paymentId) } });
    const forged = new HandleStripeWebhookCommand(Buffer.from(body), Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_attacker" }));
    await expect(s.webhook.execute(forged)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(s.uow.db.inbox.size).toBe(0);
    expect(s.uow.payment("ord_1")?.status).toBe("pending");
  });

  it("an event for another amount, order or PaymentIntent is ignored", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    for (const over of [{ amount: 1 }, { id: "pi_other" }, { metadata: { paymentId: intent.paymentId, orderId: "ord_other" } }]) {
      expect((await s.webhook.execute(s.event("payment_intent.succeeded", pi(intent.paymentId, over)))).outcome).toBe("ignored");
    }
    expect(s.uow.payment("ord_1")?.status).toBe("pending");
  });

  it("payment_intent.payment_failed records the attempt but keeps the payment payable; a retry then succeeds", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    const failed = s.event("payment_intent.payment_failed", pi(intent.paymentId, { status: "requires_payment_method", last_payment_error: { code: "card_declined", decline_code: "insufficient_funds" } }));
    expect((await s.webhook.execute(failed)).outcome).toBe("processed");
    const payment = s.uow.payment("ord_1")!;
    expect(payment.status).toBe("pending");
    expect(payment.snapshot().failureReason).toMatch(/insufficient_funds/);
    expect(s.uow.messages("PaymentFailed")).toHaveLength(0);
    await s.webhook.execute(s.event("payment_intent.succeeded", pi(intent.paymentId)));
    expect(s.uow.payment("ord_1")?.status).toBe("succeeded");
  });

  it("payment_intent.canceled fails a pending payment", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    expect((await s.webhook.execute(s.event("payment_intent.canceled", pi(intent.paymentId, { status: "canceled" })))).outcome).toBe("processed");
    expect(s.uow.payment("ord_1")?.status).toBe("failed");
    expect(s.uow.messages("PaymentFailed")).toHaveLength(1);
  });

  it("void cancels the PaymentIntent; a capture that still arrives is refunded in full through payment.void", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    await s.void.execute(new VoidPaymentCommand({ orderId: "ord_1", transactionId: intent.transactionId, reason: "expired" }));
    expect(s.stripe.cancelCalls).toEqual(["pi_fake_1"]);
    await s.webhook.execute(s.event("payment_intent.canceled", pi(intent.paymentId, { status: "canceled" })));
    expect(s.uow.payment("ord_1")?.status).toBe("voided");
    await s.webhook.execute(s.event("payment_intent.succeeded", pi(intent.paymentId)));
    expect(s.uow.messages("checkout.confirm-payment")).toHaveLength(0);
    expect(s.uow.messages("payment.void")).toHaveLength(1);
  });

  it("a refund Stripe answered as pending succeeds on refund.updated and notifies checkout once", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    await s.webhook.execute(s.event("payment_intent.succeeded", pi(intent.paymentId)));
    s.stripe.refundBehaviour = async () => ({ status: "pending", providerRefundId: "re_1" });
    await s.refund.execute(new RefundPaymentCommand({ orderId: "ord_1", refundId: "ref_1", amountCents: 1_000, reason: "damaged", returnId: null }));
    expect(s.stripe.refundCalls[0]).toMatchObject({ providerTransactionId: "pi_fake_1", amountCents: 1_000, full: false });
    expect(s.uow.messages("checkout.record-refund")).toHaveLength(0);
    const refund = { id: "re_1", object: "refund", payment_intent: "pi_fake_1", metadata: { paymentId: intent.paymentId, refundId: "ref_1" } };
    expect((await s.webhook.execute(s.event("refund.updated", { ...refund, status: "pending" }))).outcome).toBe("ignored");
    const done = s.event("charge.refund.updated", { ...refund, status: "succeeded" });
    expect((await s.webhook.execute(done)).outcome).toBe("processed");
    expect((await s.webhook.execute(s.event("refund.updated", { ...refund, status: "succeeded" }))).outcome).toBe("ignored");
    expect(s.uow.payment("ord_1")).toMatchObject({ status: "partially_refunded", refundedCents: 1_000 });
    expect(s.uow.messages("checkout.record-refund").map((m) => m.payload)).toEqual([expect.objectContaining({ refundId: "ref_1", status: "succeeded", amountCents: 1_000 })]);
  });

  it("a failed refund is recorded as failed and reported to checkout", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    await s.webhook.execute(s.event("payment_intent.succeeded", pi(intent.paymentId)));
    s.stripe.refundBehaviour = async () => ({ status: "pending", providerRefundId: "re_2" });
    await s.refund.execute(new RefundPaymentCommand({ orderId: "ord_1", refundId: "ref_2", amountCents: 2_000, reason: "x", returnId: null }));
    await s.webhook.execute(s.event("refund.failed", { id: "re_2", object: "refund", status: "failed", failure_reason: "lost_or_stolen_card", payment_intent: "pi_fake_1", metadata: {} }));
    expect(s.uow.payment("ord_1")?.refund("ref_2")?.status).toBe("failed");
    expect(s.uow.messages("checkout.record-refund")[0].payload).toMatchObject({ refundId: "ref_2", status: "failed" });
  });

  it("a refund event that arrives before the refund id was stored is matched through its metadata", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    await s.webhook.execute(s.event("payment_intent.succeeded", pi(intent.paymentId)));
    let release!: () => void;
    s.stripe.refundBehaviour = () => new Promise((resolve) => (release = () => resolve({ status: "succeeded", providerRefundId: "re_3" })));
    const refunding = s.refund.execute(new RefundPaymentCommand({ orderId: "ord_1", refundId: "ref_3", amountCents: 216_000, reason: "all", returnId: null }));
    await new Promise((r) => setTimeout(r, 10));
    const early = s.event("refund.created", { id: "re_3", object: "refund", status: "succeeded", payment_intent: "pi_fake_1", metadata: { paymentId: intent.paymentId, refundId: "ref_3" } });
    expect((await s.webhook.execute(early)).outcome).toBe("processed");
    release();
    await refunding;
    expect(s.uow.payment("ord_1")).toMatchObject({ status: "refunded", refundedCents: 216_000 });
    expect(s.uow.messages("PaymentRefunded")).toHaveLength(1);
  });

  it("unrelated event types are acknowledged and ignored", async () => {
    const s = setup();
    expect((await s.webhook.execute(s.event("customer.created", { id: "cus_1", object: "customer" }))).outcome).toBe("ignored");
  });
});
