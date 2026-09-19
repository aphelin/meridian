import type { CommandPayloads } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export type RefundOutcomeResult = "recorded" | "duplicate" | "ignored";

export class RecordRefundOutcomeCommand extends Command<RefundOutcomeResult> {
  constructor(readonly payload: CommandPayloads["checkout.record-refund"]) {
    super();
  }
}
