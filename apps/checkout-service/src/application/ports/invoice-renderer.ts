import type { InvoiceDocument } from "../../domain";

/** Turns an invoice document into a printable PDF. */
export abstract class InvoiceRenderer {
  abstract render(document: InvoiceDocument): Promise<Uint8Array>;
}
