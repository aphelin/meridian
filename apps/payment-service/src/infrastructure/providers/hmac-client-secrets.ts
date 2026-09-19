import { jwtSecret } from "@meridian/nest-kit";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ClientSecrets } from "../../application/ports";

/**
 * secret = "pcs_" + base64url(HMAC-SHA256(key, paymentId)); key derived from PAYMENT_CLIENT_SECRET_KEY or the JWT
 * secret with domain separation. The database stores only SHA-256(secret).
 */
export class HmacClientSecrets extends ClientSecrets {
  private readonly key: Buffer;

  constructor(key?: string) {
    super();
    const base = key || process.env.PAYMENT_CLIENT_SECRET_KEY?.trim() || jwtSecret();
    this.key = createHmac("sha256", base).update("meridian:payment-client-secret:v1").digest();
  }

  issue(paymentId: string): string {
    return `pcs_${createHmac("sha256", this.key).update(paymentId).digest("base64url")}`;
  }

  hash(secret: string): string {
    return createHash("sha256").update(secret, "utf8").digest("hex");
  }

  matches(secret: string, storedHash: string): boolean {
    const given = Buffer.from(this.hash(secret), "hex");
    const stored = Buffer.from(storedHash, "hex");
    return given.length === stored.length && timingSafeEqual(given, stored);
  }
}
