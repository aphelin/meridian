import { Email, ValidationError } from "@meridian/kernel";

const MAX_LENGTH = 254;
const MAX_LOCAL = 64;
// Deliberately conservative: one @, no whitespace or control characters, no header-breaking characters, a dotted domain.
const PATTERN = /^[^\s@<>()[\]\\,;:"]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
/** RFC 2606 / RFC 6761 names that can never receive mail (checkout anonymises deleted customers to `*.invalid`). */
const UNDELIVERABLE_TLDS = [".invalid", ".example", ".localhost"];

/** A normalised, syntactically valid recipient address (kernel `Email` normalisation plus validation). */
export class EmailAddress {
  private constructor(readonly value: string) {}

  static parse(input: unknown): EmailAddress {
    const value = Email.parse(input).value;
    const local = value.split("@")[0] ?? "";
    if (!value || value.length > MAX_LENGTH || local.length > MAX_LOCAL || !PATTERN.test(value)) {
      throw new ValidationError("Please enter a valid email address.", { field: "email" });
    }
    return new EmailAddress(value);
  }

  get domain(): string {
    return this.value.slice(this.value.lastIndexOf("@") + 1);
  }

  /** Reserved domains that no mail server will ever accept; sending to them only produces bounces. */
  get isUndeliverable(): boolean {
    return UNDELIVERABLE_TLDS.some((tld) => this.domain.endsWith(tld));
  }

  equals(other: EmailAddress): boolean {
    return other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
