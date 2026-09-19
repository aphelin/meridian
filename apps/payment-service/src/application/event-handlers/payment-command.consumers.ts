import type { CommandEnvelope } from "@meridian/contracts";
import { RabbitCommandHandler } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { RefundPaymentCommand, VoidPaymentCommand } from "../commands";
import { asPermanentOnRuleViolation, parsePayload } from "./message-errors";

const id = z.string().trim().min(1).max(200);

export const refundPayload = z.object({
  orderId: id,
  refundId: id,
  amountCents: z.number().int(),
  reason: z.string().max(2000),
  returnId: id.nullable(),
});

export const voidPayload = z.object({
  orderId: id,
  transactionId: id,
  reason: z.string().max(2000),
});

/** RabbitMQ command consumers; they translate envelopes into application commands on the CommandBus. */
@Injectable()
export class PaymentCommandConsumers {
  constructor(private readonly commandBus: CommandBus) {}

  @RabbitCommandHandler({ command: "payment.refund" })
  async refund(envelope: CommandEnvelope): Promise<void> {
    const payload = parsePayload(refundPayload, envelope.payload, envelope.name);
    await asPermanentOnRuleViolation(() => this.commandBus.execute(new RefundPaymentCommand(payload)));
  }

  @RabbitCommandHandler({ command: "payment.void" })
  async void(envelope: CommandEnvelope): Promise<void> {
    const payload = parsePayload(voidPayload, envelope.payload, envelope.name);
    await asPermanentOnRuleViolation(() => this.commandBus.execute(new VoidPaymentCommand(payload)));
  }
}
