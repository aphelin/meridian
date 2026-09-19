import { ValidationError } from "@meridian/kernel";

/**
 * A candidate password as typed by the user. Length is measured in characters; the upper bound keeps hashing cost
 * bounded (argon2 over megabytes of input is a denial-of-service vector).
 */
export class PlainPassword {
  static readonly MIN = 8;
  static readonly MAX = 256;
  private constructor(readonly value: string) {}

  static parse(input: unknown): PlainPassword {
    if (typeof input !== "string" || input.length < PlainPassword.MIN) {
      throw new ValidationError(`Password must be at least ${PlainPassword.MIN} characters.`, { field: "password" });
    }
    if (input.length > PlainPassword.MAX) {
      throw new ValidationError(`Password must be at most ${PlainPassword.MAX} characters.`, { field: "password" });
    }
    if (!input.trim()) throw new ValidationError("Password cannot be only spaces.", { field: "password" });
    return new PlainPassword(input);
  }

  /** Never leak the secret through logs or JSON. */
  toString() {
    return "[password]";
  }

  toJSON() {
    return "[password]";
  }
}
