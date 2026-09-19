import { createHash, randomBytes } from "node:crypto";

/** Bytes of entropy in every bearer secret the service hands out (refresh tokens, one-time links). */
export const SECRET_BYTES = 32;

/** A fresh URL-safe bearer secret (256 bits). Only its hash is ever stored. */
export function generateSecret(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

/** SHA-256 hex digest used as the lookup key for a bearer secret; a database leak never yields usable tokens. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

