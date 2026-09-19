import type { CommandEnvelope } from "@meridian/contracts";
import { RabbitCommandHandler } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { ReleaseReservationCommand, RestockItemsCommand } from "../commands";
import { asPermanentOnRuleViolation, parsePayload } from "./message-errors";

const releasePayload = z.object({
  orderId: z.string().min(1).max(100),
  reason: z.enum(["cancelled", "expired", "payment-failed"]),
});

const restockPayload = z.object({
  orderId: z.string().min(1).max(100),
  returnId: z.string().min(1).max(100).nullable(),
  lines: z
    .array(z.object({ sku: z.string().min(1).max(64), qty: z.number().int().min(1).max(1_000_000) }))
    .min(1)
    .max(100),
});

/** RabbitMQ command consumers; they translate envelopes into application commands on the CommandBus. */
@Injectable()
export class InventoryCommandConsumers {
  constructor(private readonly commandBus: CommandBus) {}

  @RabbitCommandHandler({ command: "inventory.release-reservation" })
  async releaseReservation(envelope: CommandEnvelope): Promise<void> {
    const { orderId, reason } = parsePayload(releasePayload, envelope.payload, envelope.name);
    await asPermanentOnRuleViolation(() => this.commandBus.execute(new ReleaseReservationCommand(orderId, reason, { messageId: envelope.messageId, lenient: true })));
  }

  @RabbitCommandHandler({ command: "inventory.restock" })
  async restock(envelope: CommandEnvelope): Promise<void> {
    const { orderId, returnId, lines } = parsePayload(restockPayload, envelope.payload, envelope.name);
    await asPermanentOnRuleViolation(() => this.commandBus.execute(new RestockItemsCommand(orderId, returnId, lines, envelope.messageId)));
  }
}
