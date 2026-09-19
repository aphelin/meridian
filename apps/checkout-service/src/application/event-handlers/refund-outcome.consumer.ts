import type { CommandEnvelope } from "@meridian/contracts";
import { PermanentError, RabbitCommandHandler, type RabbitHandlerMeta } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { RecordRefundOutcomeCommand } from "../commands";
import { asPermanentWhenUnfixable } from "./permanent-errors";

const payloadSchema = z.object({
  orderId: z.string().min(1).max(64),
  refundId: z.string().min(1).max(128),
  amountCents: z.int().nonnegative(),
  status: z.enum(["succeeded", "failed"]),
  reason: z.string().max(1000).nullable(),
});

/** RabbitMQ consumer of `checkout.record-refund` (payment-service reports a refund's outcome). */
@Injectable()
export class RefundOutcomeConsumer {
  constructor(private readonly commandBus: CommandBus) {}

  @RabbitCommandHandler({ command: "checkout.record-refund", prefetch: 5 })
  async recordRefund(envelope: CommandEnvelope, _meta: RabbitHandlerMeta): Promise<void> {
    const parsed = payloadSchema.safeParse(envelope.payload);
    if (!parsed.success) throw new PermanentError("invalid checkout.record-refund payload", { issues: parsed.error.issues });
    try {
      await this.commandBus.execute(new RecordRefundOutcomeCommand(parsed.data));
    } catch (error) {
      throw asPermanentWhenUnfixable(error);
    }
  }
}
