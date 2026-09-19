import type { CommandPayloads } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export type ConfirmPaymentOutcome = "paid" | "already-paid" | "voided" | "duplicate";

export class ConfirmOrderPaymentCommand extends Command<ConfirmPaymentOutcome> {
  constructor(
    /** Id of the `checkout.confirm-payment` message (inbox dedupe key). */
    readonly messageId: string,
    readonly payload: CommandPayloads["checkout.confirm-payment"],
  ) {
    super();
  }
}
