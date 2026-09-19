import { Command } from "@nestjs/cqrs";

export type GenerateInvoiceResult = "issued" | "already-issued";

export class GenerateInvoiceCommand extends Command<GenerateInvoiceResult> {
  constructor(readonly orderId: string) {
    super();
  }
}
