import type { CommandEnvelope } from "@meridian/contracts";
import { PermanentError, RabbitCommandHandler, type RabbitHandlerMeta } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { ConfirmOrderPaymentCommand } from "../commands";
import { asPermanentWhenUnfixable } from "./permanent-errors";

const payloadSchema = z.object({
  orderId: z.string().min(1).max(64),
  paymentId: z.string().min(1).max(128),
  transactionId: z.string().min(1).max(128),
  amountCents: z.int().nonnegative(),
});

/** RabbitMQ consumer of `checkout.confirm-payment` (sent by payment-service after a successful payment). */
@Injectable()
export class PaymentConfirmationConsumer {
  constructor(private readonly commandBus: CommandBus) {}

  @RabbitCommandHandler({ command: "checkout.confirm-payment", prefetch: 5 })
  async confirmPayment(envelope: CommandEnvelope, _meta: RabbitHandlerMeta): Promise<void> {
    const parsed = payloadSchema.safeParse(envelope.payload);
    if (!parsed.success) throw new PermanentError("invalid checkout.confirm-payment payload", { issues: parsed.error.issues });
    try {
      await this.commandBus.execute(new ConfirmOrderPaymentCommand(envelope.messageId, parsed.data));
    } catch (error) {
      throw asPermanentWhenUnfixable(error);
    }
  }
}
