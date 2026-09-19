import type { CommandPayloads } from "@meridian/contracts";

export class RefundPaymentCommand {
  constructor(readonly request: CommandPayloads["payment.refund"]) {}
}

export interface RefundPaymentResult {
  outcome: "accepted" | "duplicate" | "rejected" | "unknown-order";
}
