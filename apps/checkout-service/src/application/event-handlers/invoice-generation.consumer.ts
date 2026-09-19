import type { CommandEnvelope } from "@meridian/contracts";
import { createLogger, PermanentError, RabbitCommandHandler, type RabbitHandlerMeta } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { GenerateInvoiceCommand } from "../commands";
import { asPermanentWhenUnfixable } from "./permanent-errors";

const payloadSchema = z.object({ orderId: z.string().min(1).max(64) });
const log = createLogger("InvoiceGenerationConsumer");

/**
 * RabbitMQ consumer of `checkout.generate-invoice` with the default retry tiers: a storage outage is retried and, after
 * the last attempt, dead-lettered; `POST /admin/messaging/replay` resumes it once storage is back.
 */
@Injectable()
export class InvoiceGenerationConsumer {
  constructor(private readonly commandBus: CommandBus) {}

  @RabbitCommandHandler({ command: "checkout.generate-invoice", prefetch: 2 })
  async generateInvoice(envelope: CommandEnvelope, meta: RabbitHandlerMeta): Promise<void> {
    const parsed = payloadSchema.safeParse(envelope.payload);
    if (!parsed.success) throw new PermanentError("invalid checkout.generate-invoice payload", { issues: parsed.error.issues });
    try {
      await this.commandBus.execute(new GenerateInvoiceCommand(parsed.data.orderId));
    } catch (error) {
      if (meta.attempt >= meta.maxAttempts) log.error("invoice generation failed on its last attempt; dead-lettering (replayable)", { orderId: parsed.data.orderId, attempt: meta.attempt, error: error instanceof Error ? error.message : String(error) });
      throw asPermanentWhenUnfixable(error);
    }
  }
}
