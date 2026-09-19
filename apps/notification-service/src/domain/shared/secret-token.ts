import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * A one-time token handed to a mailbox. Only its SHA-256 hash is persisted, so a database leak does not let anyone
 * confirm or unsubscribe on behalf of a subscriber.
 */
export class SecretToken {
  private constructor(
    /** base64url, 256 bits of entropy. Only ever leaves the service inside an email. */
    readonly value: string,
    readonly hash: string,
  ) {}

  static generate(): SecretToken {
    const value = randomBytes(TOKEN_BYTES).toString("base64url");
    return new SecretToken(value, SecretToken.hashOf(value));
  }

  static hashOf(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }

  /** Cheap shape check before touching the database with attacker-supplied input. */
  static isWellFormed(value: unknown): value is string {
    return typeof value === "string" && TOKEN_PATTERN.test(value);
  }
}
