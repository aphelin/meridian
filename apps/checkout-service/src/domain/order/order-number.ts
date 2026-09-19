import { ValidationError } from "@meridian/kernel";
import { randomBytes } from "node:crypto";

/** RFC 4648 base32 alphabet. */
export const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PATTERN = /^M-[A-Z2-7]{8}$/;

/** Human order number: "M-" + 8 base32 characters (40 random bits). */
export class OrderNumber {
  private constructor(readonly value: string) {}

  /** Encodes exactly 5 bytes (40 bits) into 8 base32 characters. */
  static fromBytes(bytes: Uint8Array): OrderNumber {
    if (bytes.length !== 5) throw new ValidationError("An order number needs exactly 5 random bytes.");
    let bits = 0n;
    for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
    let out = "";
    for (let shift = 35n; shift >= 0n; shift -= 5n) out += BASE32_ALPHABET[Number((bits >> shift) & 31n)];
    return new OrderNumber(`M-${out}`);
  }

  static generate(random: (size: number) => Uint8Array = randomBytes): OrderNumber {
    return OrderNumber.fromBytes(random(5));
  }

  static parse(value: string): OrderNumber {
    if (!PATTERN.test(value)) throw new ValidationError("Invalid order number.", { value });
    return new OrderNumber(value);
  }

  toString() {
    return this.value;
  }
}
