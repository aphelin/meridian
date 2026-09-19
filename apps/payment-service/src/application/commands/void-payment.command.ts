import type { CommandPayloads } from "@meridian/contracts";

export class VoidPaymentCommand {
  constructor(readonly request: CommandPayloads["payment.void"]) {}
}

export interface VoidPaymentResult {
  outcome: "voided" | "already-closed" | "unknown-payment";
}
