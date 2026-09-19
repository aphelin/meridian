import { ValidationError } from "@meridian/kernel";

const PATTERN = /^INV-(\d{4})-(\d{6,})$/;

/** Legal invoice number `INV-YYYY-000123`: issue year plus a gap-minimising sequence value, zero-padded to 6 digits. */
export class InvoiceNumber {
  private constructor(
    readonly value: string,
    readonly year: number,
    readonly sequence: number,
  ) {}

  static from(year: number, sequence: number): InvoiceNumber {
    if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new ValidationError("Invalid invoice year.", { year });
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new ValidationError("Invoice sequence values start at 1.", { sequence });
    return new InvoiceNumber(`INV-${year}-${String(sequence).padStart(6, "0")}`, year, sequence);
  }

  static parse(value: string): InvoiceNumber {
    const match = PATTERN.exec(value);
    if (!match) throw new ValidationError("Invalid invoice number.", { value });
    return InvoiceNumber.from(Number(match[1]), Number(match[2]));
  }

  toString() {
    return this.value;
  }
}
