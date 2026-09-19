import { AggregateRoot, ensure } from "@meridian/kernel";
import type { ContractEvent } from "../shared/events";
import { InvoiceNumber } from "./invoice-number";

export type InvoiceStatus = "allocated" | "issued";

export interface InvoiceProps {
  id: string;
  orderId: string;
  number: string;
  /** Postgres sequence value behind the number. */
  sequence: number;
  status: InvoiceStatus;
  /** Object key of the PDF in the invoices bucket. */
  objectKey: string;
  totalCents: number;
  createdAt: Date;
  issuedAt: Date | null;
}

/**
 * One invoice per paid order. The number is allocated (and persisted) before the PDF is stored, so a retried
 * generation reuses it instead of burning another sequence value; the invoice is issued once its PDF is stored.
 * The shopper-visible fact (InvoiceIssued) is raised by the Order, which references the invoice number.
 */
export class Invoice extends AggregateRoot<ContractEvent> {
  private constructor(private props: InvoiceProps) {
    super();
  }

  static allocate(input: { id: string; orderId: string; sequence: number; totalCents: number; now: Date }): Invoice {
    const number = InvoiceNumber.from(input.now.getUTCFullYear(), input.sequence);
    ensure(Number.isSafeInteger(input.totalCents) && input.totalCents >= 0, "VALIDATION_FAILED", "Invoice total must not be negative.");
    return new Invoice({
      id: input.id,
      orderId: input.orderId,
      number: number.value,
      sequence: number.sequence,
      status: "allocated",
      objectKey: `invoices/${number.year}/${number.value}.pdf`,
      totalCents: input.totalCents,
      createdAt: input.now,
      issuedAt: null,
    });
  }

  static restore(props: InvoiceProps): Invoice {
    return new Invoice({ ...props });
  }

  get id() {
    return this.props.id;
  }
  get orderId() {
    return this.props.orderId;
  }
  get number() {
    return this.props.number;
  }
  get objectKey() {
    return this.props.objectKey;
  }
  get status() {
    return this.props.status;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get isIssued() {
    return this.props.status === "issued";
  }

  snapshot(): InvoiceProps {
    return { ...this.props };
  }

  /** The PDF is stored: the invoice becomes downloadable. Idempotent. */
  markIssued(now: Date): boolean {
    if (this.props.status === "issued") return false;
    this.props.status = "issued";
    this.props.issuedAt = now;
    return true;
  }
}
