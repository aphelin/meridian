import { DomainError, Money } from "@meridian/kernel";
import { describe, expect, it } from "vitest";
import { Payment } from "./payment";

const now = new Date("2026-09-17T10:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

function localPayment(amountCents = 10_000) {
  return Payment.open({
    id: "pay_1",
    orderId: "ord_1",
    orderNumber: "M-TEST",
    transactionId: "txn_1",
    provider: "local-sandbox",
    amount: Money.cents(amountCents),
    clientSecretHash: "hash",
    now,
  });
}

function captured(amountCents = 10_000) {
  const payment = localPayment(amountCents);
  payment.succeed(now);
  payment.pullEvents();
  return payment;
}

describe("Payment intent (aggregate creation)", () => {
  it("opens a pending intent with a positive amount", () => {
    const payment = localPayment();
    expect(payment.status).toBe("pending");
    expect(payment.amount.cents).toBe(10_000);
    expect(payment.pullEvents()).toEqual([]);
  });

  it("refuses zero amounts and local sandbox intents without a client secret", () => {
    expect(() => localPayment(0)).toThrow(DomainError);
    expect(() =>
      Payment.open({ id: "p", orderId: "o", orderNumber: "M", transactionId: "t", provider: "local-sandbox", amount: Money.cents(1), clientSecretHash: null, now }),
    ).toThrow(/client secret/);
  });

  it("paddle payments never carry a client secret and link one provider transaction idempotently", () => {
    expect(() =>
      Payment.open({ id: "p", orderId: "o", orderNumber: "M", transactionId: "t", provider: "paddle-sandbox", amount: Money.cents(1), clientSecretHash: "x", now }),
    ).toThrow();
    const paddle = Payment.open({ id: "p", orderId: "o", orderNumber: "M", transactionId: "t", provider: "paddle-sandbox", amount: Money.cents(1), clientSecretHash: null, now });
    paddle.attachProviderTransaction("txn_paddle", now);
    paddle.attachProviderTransaction("txn_paddle", now);
    expect(() => paddle.attachProviderTransaction("txn_other", now)).toThrow(/another provider transaction/);
  });
});

describe("Payment settlement", () => {
  it("sandbox succeed raises PaymentSucceeded once; a replay is a no-op", () => {
    const payment = localPayment();
    expect(payment.succeed(now)).toBe(true);
    expect(payment.succeed(later(1))).toBe(false);
    const events = payment.pullEvents();
    expect(events.map((e) => e.name)).toEqual(["PaymentSucceeded"]);
    expect(events[0].payload).toMatchObject({ paymentId: "pay_1", orderId: "ord_1", transactionId: "txn_1", amountCents: 10_000, provider: "local-sandbox" });
  });

  it("refuses to take money for a voided payment (ORDER_NOT_PAYABLE)", () => {
    const payment = localPayment();
    payment.void("order expired", now);
    expect(() => payment.succeed(now)).toThrow(expect.objectContaining({ code: "ORDER_NOT_PAYABLE" }));
  });

  it("a provider capture after void schedules a full void refund instead of confirming", () => {
    const payment = localPayment();
    payment.void("expired", now);
    payment.pullEvents();
    expect(payment.recordProviderCapture(later(5))).toBe("refund-required");
    expect(payment.recordProviderCapture(later(6))).toBe("duplicate");
    expect(payment.pullEvents()).toEqual([]);
    expect(payment.refundsAwaitingDispatch()).toEqual(["void_pay_1"]);
    expect(payment.refund("void_pay_1")).toMatchObject({ kind: "void", amountCents: 10_000, status: "pending" });
  });

  it("fail only closes pending payments", () => {
    const payment = localPayment();
    expect(payment.fail("canceled", now)).toBe(true);
    expect(payment.fail("again", now)).toBe(false);
    expect(payment.pullEvents().map((e) => e.name)).toEqual(["PaymentFailed"]);
  });
});

describe("Payment refunds", () => {
  it("partial refund moves to partially_refunded, then refunded when the balance is exhausted", () => {
    const payment = captured();
    expect(payment.requestRefund({ refundId: "r1", amountCents: 4_000, reason: "partial", now })).toBe("accepted");
    expect(payment.claimRefundDispatch("r1", now, 30_000)).toBe("dispatch");
    payment.completeRefund("r1", null, now);
    expect(payment.status).toBe("partially_refunded");
    expect(payment.refundedCents).toBe(4_000);
    payment.requestRefund({ refundId: "r2", amountCents: 6_000, reason: "rest", now });
    payment.completeRefund("r2", null, now);
    expect(payment.status).toBe("refunded");
    const refunded = payment.pullEvents().filter((e) => e.name === "PaymentRefunded");
    expect(refunded.map((e) => e.payload)).toEqual([
      expect.objectContaining({ refundId: "r1", amountCents: 4_000 }),
      expect.objectContaining({ refundId: "r2", amountCents: 6_000 }),
    ]);
  });

  it("the same refundId is applied once (idempotent)", () => {
    const payment = captured();
    payment.requestRefund({ refundId: "r1", amountCents: 1_000, reason: "x", now });
    expect(payment.requestRefund({ refundId: "r1", amountCents: 1_000, reason: "x", now })).toBe("duplicate");
    expect(payment.refundableCents).toBe(9_000);
  });

  it("a refund above the refundable balance (counting pending refunds) is rejected with RefundFailed", () => {
    const payment = captured();
    payment.requestRefund({ refundId: "r1", amountCents: 8_000, reason: "x", now });
    expect(payment.requestRefund({ refundId: "r2", amountCents: 3_000, reason: "too much", now })).toBe("rejected");
    const [failed] = payment.pullEvents();
    expect(failed.name).toBe("RefundFailed");
    expect(failed.context).toMatchObject({ refundKind: "refund", refundAmountCents: 3_000 });
    expect(payment.refund("r2")?.status).toBe("failed");
  });

  it("refunds of an uncaptured payment are rejected", () => {
    const payment = localPayment();
    expect(payment.requestRefund({ refundId: "r1", amountCents: 100, reason: "x", now })).toBe("rejected");
  });

  it("refund dispatch lease prevents concurrent provider calls and expires", () => {
    const payment = captured();
    payment.requestRefund({ refundId: "r1", amountCents: 100, reason: "x", now });
    expect(payment.claimRefundDispatch("r1", now, 30_000)).toBe("dispatch");
    expect(payment.claimRefundDispatch("r1", later(1_000), 30_000)).toBe("in-flight");
    expect(payment.claimRefundDispatch("r1", later(31_000), 30_000)).toBe("dispatch");
    payment.markRefundSubmitted("r1", "adj_1", later(31_001));
    expect(payment.claimRefundDispatch("r1", later(40_000), 30_000)).toBe("submitted");
  });

  it("a failed refund releases its amount back to the refundable balance", () => {
    const payment = captured();
    payment.requestRefund({ refundId: "r1", amountCents: 10_000, reason: "x", now });
    expect(payment.refundableCents).toBe(0);
    expect(payment.failRefund("r1", "rejected", now)).toBe(true);
    expect(payment.failRefund("r1", "rejected", now)).toBe(false);
    expect(payment.refundableCents).toBe(10_000);
  });
});

describe("Payment void", () => {
  it("void of a pending payment raises PaymentVoided and is idempotent", () => {
    const payment = localPayment();
    expect(payment.void("order expired", now)).toBe(true);
    expect(payment.void("order expired", now)).toBe(false);
    expect(payment.status).toBe("voided");
    expect(payment.pullEvents().map((e) => e.name)).toEqual(["PaymentVoided"]);
    expect(payment.refundsAwaitingDispatch()).toEqual([]);
  });

  it("void of a captured, partially refunded payment refunds the remaining balance", () => {
    const payment = captured();
    payment.requestRefund({ refundId: "r1", amountCents: 2_500, reason: "x", now });
    payment.completeRefund("r1", null, now);
    payment.void("not payable", now);
    expect(payment.status).toBe("voided");
    expect(payment.refund("void_pay_1")).toMatchObject({ amountCents: 7_500, kind: "void", status: "pending" });
    payment.completeRefund("void_pay_1", null, now);
    expect(payment.status).toBe("voided");
    expect(payment.refundedCents).toBe(10_000);
  });
});
