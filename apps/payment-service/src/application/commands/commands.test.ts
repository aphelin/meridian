import { UpstreamUnavailableError } from "@meridian/nest-kit";
import { describe, expect, it } from "vitest";
import { FakeProvider, FakeProviders, InMemoryUnitOfWork, PlainClientSecrets, StaticVerifier, settings, testClock } from "../../test-support/in-memory";
import { ProviderRejectedError } from "../ports";
import { RefundDispatcher, RefundDispatchInProgressError } from "../services/refund-dispatcher";
import { GetPaymentByOrderHandler } from "../queries";
import { CompleteSandboxPaymentCommand, CompleteSandboxPaymentHandler } from "./index";
import { CreatePaymentIntentCommand, CreatePaymentIntentHandler } from "./index";
import { HandlePaddleWebhookCommand, HandlePaddleWebhookHandler } from "./index";
import { RefundPaymentCommand, RefundPaymentHandler } from "./index";
import { VoidPaymentCommand, VoidPaymentHandler } from "./index";

const request = (orderId = "ord_1", amountCents = 216_000) => ({
  orderId,
  orderNumber: "M-ABCD1234",
  amountCents,
  currency: "EUR" as const,
  customer: { email: "buyer@example.test", name: "Buyer" },
  lines: [{ name: "Holt", qty: 1, unitPriceCents: amountCents }],
});

function setup(paddle = false) {
  const uow = new InMemoryUnitOfWork();
  const providers = new FakeProviders(new FakeProvider("local-sandbox"), paddle ? new FakeProvider("paddle-sandbox") : null);
  const secrets = new PlainClientSecrets();
  const clock = testClock();
  const verifier = new StaticVerifier();
  const dispatcher = new RefundDispatcher(uow, providers, clock, settings);
  return {
    uow,
    providers,
    clock,
    verifier,
    dispatcher,
    intent: new CreatePaymentIntentHandler(uow, providers, secrets, clock),
    complete: new CompleteSandboxPaymentHandler(uow, providers, secrets, clock),
    webhook: new HandlePaddleWebhookHandler(uow, verifier, clock),
    refund: new RefundPaymentHandler(uow, dispatcher, clock),
    void: new VoidPaymentHandler(uow, providers, dispatcher, clock),
  };
}

async function paidLocal(s: ReturnType<typeof setup>, orderId = "ord_1", amountCents = 216_000) {
  const intent = await s.intent.execute(new CreatePaymentIntentCommand(request(orderId, amountCents)));
  await s.complete.execute(new CompleteSandboxPaymentCommand(intent.transactionId, intent.clientSecret!));
  return intent;
}

const notification = (eventType: string, data: Record<string, unknown>, id = `ntf_${Math.random()}`) =>
  new HandlePaddleWebhookCommand(Buffer.from(JSON.stringify({ notification_id: id, event_type: eventType, data })), "ts=1;h1=00");

describe("CreatePaymentIntent", () => {
  it("creates a local sandbox intent with a client secret stored only as a hash", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    expect(intent).toMatchObject({ provider: "local-sandbox", status: "pending", paddle: null });
    expect(intent.clientSecret).toBeTruthy();
    expect(s.uow.payment("ord_1")?.clientSecretHash).toBe(`hash:${intent.clientSecret}`);
  });

  it("intent is idempotent per order and refuses a different amount", async () => {
    const s = setup();
    const first = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    const again = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    expect(again).toEqual(first);
    await expect(s.intent.execute(new CreatePaymentIntentCommand(request("ord_1", 1)))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("paddle intent creates one provider transaction and returns the sandbox client configuration", async () => {
    const s = setup(true);
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    await s.intent.execute(new CreatePaymentIntentCommand(request()));
    expect(intent).toMatchObject({ provider: "paddle-sandbox", clientSecret: null, paddle: { transactionId: "txn_paddle_1", clientToken: "test_token", environment: "sandbox" } });
    expect(s.providers.paddle!.createCalls).toHaveLength(1);
    expect(s.providers.paddle!.createCalls[0]).toMatchObject({ orderId: "ord_1", amountCents: 216_000, currency: "EUR" });
  });

  it("a paddle outage leaves the intent retryable", async () => {
    const s = setup(true);
    const paddle = s.providers.paddle!;
    const original = paddle.createTransaction.bind(paddle);
    paddle.createTransaction = async () => {
      throw new UpstreamUnavailableError("paddle", "timeout");
    };
    await expect(s.intent.execute(new CreatePaymentIntentCommand(request()))).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    paddle.createTransaction = original;
    const retried = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    expect(retried.paddle?.transactionId).toBe("txn_paddle_1");
  });

  it("a paddle refusal to create the transaction surfaces as UPSTREAM_UNAVAILABLE", async () => {
    const s = setup(true);
    s.providers.paddle!.createTransaction = async () => {
      throw new ProviderRejectedError("paddle-sandbox", "refused", "bad_request");
    };
    await expect(s.intent.execute(new CreatePaymentIntentCommand(request()))).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });
});

describe("CompleteSandboxPayment", () => {
  it("sandbox completion confirms the payment and enqueues checkout.confirm-payment once (replay-safe)", async () => {
    const s = setup();
    const intent = await paidLocal(s);
    const replay = await s.complete.execute(new CompleteSandboxPaymentCommand(intent.transactionId, intent.clientSecret!));
    expect(replay.status).toBe("succeeded");
    expect(s.uow.messages("PaymentSucceeded")).toHaveLength(1);
    const confirms = s.uow.messages("checkout.confirm-payment");
    expect(confirms).toHaveLength(1);
    expect(confirms[0].payload).toEqual({ orderId: "ord_1", paymentId: intent.paymentId, transactionId: intent.transactionId, amountCents: 216_000 });
  });

  it("sandbox completion rejects a wrong client secret (403) and unknown transactions (404)", async () => {
    const s = setup();
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    await expect(s.complete.execute(new CompleteSandboxPaymentCommand(intent.transactionId, "nope"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(s.complete.execute(new CompleteSandboxPaymentCommand("txn_missing", intent.clientSecret!))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(s.uow.messages()).toHaveLength(0);
  });

  it("sandbox completion is unavailable (404) when paddle is the provider", async () => {
    const s = setup(true);
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    await expect(s.complete.execute(new CompleteSandboxPaymentCommand(intent.transactionId, "x"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("HandlePaddleWebhook", () => {
  it("paddle webhook transaction.completed settles once; a replayed notification is a duplicate", async () => {
    const s = setup(true);
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    const cmd = notification("transaction.completed", { id: "txn_paddle_1", status: "completed", custom_data: { orderId: "ord_1", paymentId: intent.paymentId } }, "ntf_1");
    expect(await s.webhook.execute(cmd)).toEqual({ received: true, outcome: "processed" });
    expect(await s.webhook.execute(cmd)).toEqual({ received: true, outcome: "duplicate" });
    const paid = notification("transaction.paid", { id: "txn_paddle_1", custom_data: { paymentId: intent.paymentId } }, "ntf_2");
    expect((await s.webhook.execute(paid)).outcome).toBe("ignored");
    expect(s.uow.messages("checkout.confirm-payment")).toHaveLength(1);
    expect(s.uow.messages("PaymentSucceeded")[0].payload).toMatchObject({ provider: "paddle-sandbox", orderId: "ord_1" });
  });

  it("paddle webhook referencing another order or transaction is ignored", async () => {
    const s = setup(true);
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    const wrongOrder = notification("transaction.completed", { id: "txn_paddle_1", custom_data: { orderId: "ord_other", paymentId: intent.paymentId } });
    const wrongTxn = notification("transaction.completed", { id: "txn_paddle_9", custom_data: { paymentId: intent.paymentId } });
    expect((await s.webhook.execute(wrongOrder)).outcome).toBe("ignored");
    expect((await s.webhook.execute(wrongTxn)).outcome).toBe("ignored");
    expect(s.uow.payment("ord_1")?.status).toBe("pending");
  });

  it("webhook with an invalid signature changes nothing", async () => {
    const s = setup(true);
    s.verifier.valid = false;
    await expect(s.webhook.execute(notification("transaction.completed", { id: "x" }))).rejects.toThrow(/signature/);
    expect(s.uow.db.inbox.size).toBe(0);
  });

  it("paddle capture of a voided payment schedules a refund through payment.void", async () => {
    const s = setup(true);
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    await s.void.execute(new VoidPaymentCommand({ orderId: "ord_1", transactionId: intent.transactionId, reason: "expired" }));
    expect(s.providers.paddle!.cancelCalls).toEqual(["txn_paddle_1"]);
    await s.webhook.execute(notification("transaction.completed", { id: "txn_paddle_1", custom_data: { paymentId: intent.paymentId } }));
    expect(s.uow.messages("checkout.confirm-payment")).toHaveLength(0);
    expect(s.uow.messages("payment.void")).toHaveLength(1);
    s.providers.paddle!.refundBehaviour = async () => ({ status: "pending", providerRefundId: "adj_1" });
    await s.void.execute(new VoidPaymentCommand({ orderId: "ord_1", transactionId: intent.transactionId, reason: "captured late" }));
    expect(s.providers.paddle!.refundCalls[0]).toMatchObject({ full: true, amountCents: 216_000, providerTransactionId: "txn_paddle_1" });
    await s.webhook.execute(notification("adjustment.updated", { id: "adj_1", action: "refund", status: "approved", transaction_id: "txn_paddle_1" }));
    expect(s.uow.payment("ord_1")?.refundedCents).toBe(216_000);
    expect(s.uow.messages("checkout.record-refund")).toHaveLength(0);
  });

  it("paddle adjustment approval completes a submitted refund and notifies checkout", async () => {
    const s = setup(true);
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request()));
    await s.webhook.execute(notification("transaction.completed", { id: "txn_paddle_1", custom_data: { paymentId: intent.paymentId } }));
    s.providers.paddle!.refundBehaviour = async () => ({ status: "pending", providerRefundId: "adj_9" });
    await s.refund.execute(new RefundPaymentCommand({ orderId: "ord_1", refundId: "ref_1", amountCents: 1000, reason: "damaged", returnId: null }));
    expect(s.uow.messages("checkout.record-refund")).toHaveLength(0);
    await s.webhook.execute(notification("adjustment.updated", { id: "adj_9", action: "refund", status: "approved", transaction_id: "txn_paddle_1" }));
    expect(s.uow.messages("checkout.record-refund")[0].payload).toMatchObject({ refundId: "ref_1", status: "succeeded", amountCents: 1000 });
  });
});

describe("RefundPayment", () => {
  it("refund succeeds through the local provider: PaymentRefunded + record-refund succeeded", async () => {
    const s = setup();
    await paidLocal(s);
    const result = await s.refund.execute(new RefundPaymentCommand({ orderId: "ord_1", refundId: "ref_1", amountCents: 50_000, reason: "partial", returnId: null }));
    expect(result.outcome).toBe("accepted");
    expect(s.uow.messages("PaymentRefunded")[0].payload).toMatchObject({ refundId: "ref_1", amountCents: 50_000 });
    expect(s.uow.messages("checkout.record-refund")[0].payload).toEqual({ orderId: "ord_1", refundId: "ref_1", amountCents: 50_000, status: "succeeded", reason: "partial" });
    expect(s.uow.payment("ord_1")?.status).toBe("partially_refunded");
  });

  it("refund replay with the same refundId applies once (idempotent)", async () => {
    const s = setup();
    await paidLocal(s);
    const cmd = new RefundPaymentCommand({ orderId: "ord_1", refundId: "ref_1", amountCents: 50_000, reason: "partial", returnId: null });
    await s.refund.execute(cmd);
    expect((await s.refund.execute(cmd)).outcome).toBe("duplicate");
    expect(s.providers.local.refundCalls).toHaveLength(1);
    expect(s.uow.payment("ord_1")?.refundedCents).toBe(50_000);
  });

  it("refund above the balance and refund for an unknown order both report failure to checkout", async () => {
    const s = setup();
    await paidLocal(s);
    await s.refund.execute(new RefundPaymentCommand({ orderId: "ord_1", refundId: "big", amountCents: 500_000, reason: "too much", returnId: null }));
    await s.refund.execute(new RefundPaymentCommand({ orderId: "ord_none", refundId: "r", amountCents: 1, reason: "x", returnId: null }));
    await s.refund.execute(new RefundPaymentCommand({ orderId: "ord_none", refundId: "r", amountCents: 1, reason: "x", returnId: null }));
    expect(s.uow.messages("RefundFailed").map((m) => m.payload)).toEqual([
      expect.objectContaining({ refundId: "big" }),
      expect.objectContaining({ refundId: "r", orderId: "ord_none" }),
    ]);
    expect(s.uow.messages("checkout.record-refund").every((m) => (m.payload as { status: string }).status === "failed")).toBe(true);
    expect(s.providers.local.refundCalls).toHaveLength(0);
  });

  it("provider refund rejection is recorded as failed; transient errors release the lease and are retried", async () => {
    const s = setup();
    await paidLocal(s);
    s.providers.local.refundBehaviour = async () => {
      throw new UpstreamUnavailableError("paddle", "timeout");
    };
    const cmd = new RefundPaymentCommand({ orderId: "ord_1", refundId: "ref_t", amountCents: 100, reason: "x", returnId: null });
    await expect(s.refund.execute(cmd)).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(s.uow.payment("ord_1")?.refund("ref_t")).toMatchObject({ status: "pending", dispatchLeaseUntil: null });
    s.providers.local.refundBehaviour = async () => {
      throw new ProviderRejectedError("local-sandbox", "no", "refused");
    };
    await s.refund.execute(cmd);
    expect(s.uow.payment("ord_1")?.refund("ref_t")?.status).toBe("failed");
    expect(s.uow.messages("checkout.record-refund")[0].payload).toMatchObject({ refundId: "ref_t", status: "failed" });
  });

  it("a refund already being dispatched by another worker is retried later", async () => {
    const s = setup();
    await paidLocal(s);
    let release!: () => void;
    s.providers.local.refundBehaviour = () => new Promise((resolve) => (release = () => resolve({ status: "succeeded", providerRefundId: null })));
    const cmd = new RefundPaymentCommand({ orderId: "ord_1", refundId: "ref_c", amountCents: 100, reason: "x", returnId: null });
    const first = s.refund.execute(cmd);
    await new Promise((r) => setTimeout(r, 10));
    await expect(s.refund.execute(cmd)).rejects.toBeInstanceOf(RefundDispatchInProgressError);
    release();
    await first;
    expect(s.providers.local.refundCalls).toHaveLength(1);
  });
});

describe("VoidPayment", () => {
  it("void of a succeeded sandbox payment records a full refund and PaymentVoided", async () => {
    const s = setup();
    const intent = await paidLocal(s, "ord_v", 1000);
    const result = await s.void.execute(new VoidPaymentCommand({ orderId: "ord_v", transactionId: intent.transactionId, reason: "order expired" }));
    expect(result.outcome).toBe("voided");
    const payment = s.uow.payment("ord_v")!;
    expect(payment.status).toBe("voided");
    expect(payment.refundedCents).toBe(1000);
    expect(s.uow.messages("PaymentVoided")).toHaveLength(1);
    expect(s.uow.messages("checkout.record-refund")).toHaveLength(0);
    const again = await s.void.execute(new VoidPaymentCommand({ orderId: "ord_v", transactionId: intent.transactionId, reason: "order expired" }));
    expect(again.outcome).toBe("already-closed");
    expect(s.providers.local.refundCalls).toHaveLength(1);
  });

  it("void refuses a transaction that belongs to another order", async () => {
    const s = setup();
    const intent = await paidLocal(s);
    await expect(s.void.execute(new VoidPaymentCommand({ orderId: "ord_other", transactionId: intent.transactionId, reason: "x" }))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});

describe("GetPaymentByOrder", () => {
  it("returns 404 for an order without payment", async () => {
    const handler = new GetPaymentByOrderHandler({ summaryByOrder: async () => null });
    await expect(handler.execute({ orderId: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("VoidPayment with a refund in flight", () => {
  it("a refund rejected after the void is topped up by a scheduled void refund", async () => {
    const s = setup(true);
    const intent = await s.intent.execute(new CreatePaymentIntentCommand(request("ord_x", 10_000)));
    await s.webhook.execute(notification("transaction.completed", { id: "txn_paddle_1", custom_data: { paymentId: intent.paymentId } }));
    s.providers.paddle!.refundBehaviour = async () => ({ status: "pending", providerRefundId: "adj_r" });
    await s.refund.execute(new RefundPaymentCommand({ orderId: "ord_x", refundId: "ref_1", amountCents: 4_000, reason: "x", returnId: null }));
    s.providers.paddle!.refundBehaviour = async (input) => ({ status: "pending", providerRefundId: `adj_${input.refundId}` });
    await s.void.execute(new VoidPaymentCommand({ orderId: "ord_x", transactionId: intent.transactionId, reason: "cancelled" }));
    expect(s.providers.paddle!.refundCalls.at(-1)).toMatchObject({ refundId: `void_${intent.paymentId}`, amountCents: 6_000 });
    await s.webhook.execute(notification("adjustment.updated", { id: "adj_r", action: "refund", status: "rejected", transaction_id: "txn_paddle_1" }));
    expect(s.uow.payment("ord_x")?.refund(`void_${intent.paymentId}_2`)).toMatchObject({ amountCents: 4_000, status: "pending" });
    expect(s.uow.messages("payment.void")).toHaveLength(1);
    await s.void.execute(new VoidPaymentCommand({ orderId: "ord_x", transactionId: intent.transactionId, reason: "cancelled" }));
    expect(s.providers.paddle!.refundCalls.at(-1)).toMatchObject({ refundId: `void_${intent.paymentId}_2`, amountCents: 4_000 });
  });
});
