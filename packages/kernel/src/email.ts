import { ValidationError } from "./errors";

const PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A normalised email address (trimmed, lower case, at most 254 characters). */
export class Email {
  private constructor(readonly value: string) {}

  static parse(input: unknown): Email {
    const value = typeof input === "string" ? input.trim().toLowerCase() : "";
    if (!value || value.length > 254 || !PATTERN.test(value)) throw new ValidationError("Enter a valid email address.");
    return new Email(value);
  }

  equals(other: Email): boolean {
    return other.value === this.value;
  }

  toString() {
    return this.value;
  }

  toJSON() {
    return this.value;
  }
}
