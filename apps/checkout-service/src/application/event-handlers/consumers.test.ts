import type { CommandEnvelope } from "@meridian/contracts";
import { DomainError } from "@meridian/kernel";
import { isPermanentError } from "@meridian/nest-kit";
import type { CommandBus } from "@nestjs/cqrs";
import { describe, expect, it } from "vitest";
import { GenerateInvoiceCommand } from "../commands/generate-invoice.command";
import { RecordRefundOutcomeCommand } from "../commands/record-refund-outcome.command";
import { InvoiceGenerationConsumer } from "./invoice-generation.consumer";
import { asPermanentWhenUnfixable } from "./permanent-errors";
import { RefundOutcomeConsumer } from "./refund-outcome.consumer";

const envelope = (payload: unknown): CommandEnvelope =>
  ({ messageId: "m1", kind: "command", name: "checkout.record-refund", version: 1, occurredAt: "2026-09-17T10:00:00Z", producer: "t", correlationId: "c", causationId: null, aggregateType: null, aggregateId: null, payload }) as unknown as CommandEnvelope;

function bus(result: () => Promise<unknown>) {
  const executed: unknown[] = [];
  return { executed, bus: { execute: (command: unknown) => (executed.push(command), result()) } as unknown as CommandBus };
}

describe("command consumers", () => {
  it("refund outcome consumer dispatches RecordRefundOutcome and rejects malformed payloads permanently", async () => {
    const { executed, bus: commandBus } = bus(async () => "recorded");
    const consumer = new RefundOutcomeConsumer(commandBus);
    await consumer.recordRefund(envelope({ orderId: "o1", refundId: "r1", amountCents: 100, status: "succeeded", reason: null }), { attempt: 1, maxAttempts: 4 });
    expect(executed[0]).toBeInstanceOf(RecordRefundOutcomeCommand);
    await expect(consumer.recordRefund(envelope({ orderId: "o1", status: "maybe" }), { attempt: 1, maxAttempts: 4 })).rejects.toSatisfy(isPermanentError);
  });

  it("invoice consumer keeps storage outages retryable so they dead-letter only after the last attempt", async () => {
    const outage = new InvoiceGenerationConsumer(bus(async () => Promise.reject(new DomainError("UPSTREAM_UNAVAILABLE", "s3 down"))).bus);
    const error = await outage.generateInvoice(envelope({ orderId: "o1" }), { attempt: 4, maxAttempts: 4 }).catch((e: unknown) => e);
    expect(isPermanentError(error)).toBe(false);
    const missing = new InvoiceGenerationConsumer(bus(async () => Promise.reject(new DomainError("NOT_FOUND", "no order"))).bus);
    await expect(missing.generateInvoice(envelope({ orderId: "o1" }), { attempt: 1, maxAttempts: 4 })).rejects.toSatisfy(isPermanentError);
    const { executed, bus: ok } = bus(async () => "issued");
    await new InvoiceGenerationConsumer(ok).generateInvoice(envelope({ orderId: "o1" }), { attempt: 1, maxAttempts: 4 });
    expect(executed[0]).toEqual(new GenerateInvoiceCommand("o1"));
  });

  it("chaos and outages stay retryable; missing records and invalid transitions are permanent", () => {
    expect(isPermanentError(asPermanentWhenUnfixable(new DomainError("CHAOS_INJECTED", "chaos")))).toBe(false);
    expect(isPermanentError(asPermanentWhenUnfixable(new Error("socket hang up")))).toBe(false);
    expect(isPermanentError(asPermanentWhenUnfixable(new DomainError("INVALID_TRANSITION", "unpaid")))).toBe(true);
  });
});
