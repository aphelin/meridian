import { describe, expect, it } from "vitest";
import { paymentEvent } from "../../domain";
import { outboundMessages } from "./outbound-messages";

const at = new Date("2026-09-17T10:00:00Z");

describe("outboundMessages", () => {
  it("maps checkout refunds to checkout.record-refund, but not void refunds", () => {
    const payload = { paymentId: "p", orderId: "o", refundId: "r", amountCents: 5, provider: "local-sandbox" as const };
    const refund = outboundMessages([paymentEvent("PaymentRefunded", "p", payload, at, { refundKind: "refund", refundReason: "why" })]);
    expect(refund.map((m) => m.name)).toEqual(["PaymentRefunded", "checkout.record-refund"]);
    const voidRefund = outboundMessages([paymentEvent("PaymentRefunded", "p", payload, at, { refundKind: "void" })]);
    expect(voidRefund.map((m) => m.name)).toEqual(["PaymentRefunded"]);
  });

  it("keys every message by the payment aggregate", () => {
    const messages = outboundMessages([
      paymentEvent("PaymentSucceeded", "p", { paymentId: "p", orderId: "o", transactionId: "t", amountCents: 1, provider: "local-sandbox" }, at),
    ]);
    expect(messages.every((m) => m.aggregate?.id === "p" && m.aggregate.type === "Payment")).toBe(true);
  });
});
