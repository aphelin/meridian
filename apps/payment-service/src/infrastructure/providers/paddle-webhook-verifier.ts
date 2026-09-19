import { DomainError } from "@meridian/kernel";
import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookVerifier } from "../../application/ports";
import { PAYMENT_CONFIG, type PaymentConfig } from "../config/payment-settings";

export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Pure Paddle-Signature check: `ts=<unix>;h1=<hex HMAC-SHA256(secret, "<ts>:<raw body>")>`, several h1 allowed (secret rotation). */
export function verifyPaddleSignature(rawBody: Buffer | undefined, header: string | undefined, secret: string | null, now: Date): boolean {
  if (!secret || !rawBody || !header || header.length > 2000) return false;
  const parts = header.split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part.trim(), ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  });
  const ts = parts.find(([key]) => key === "ts")?.[1];
  if (!ts || !/^\d{1,12}$/.test(ts)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(ts)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:`).update(rawBody).digest();
  return parts
    .filter(([key, value]) => key === "h1" && /^[0-9a-f]+$/i.test(value))
    .some(([, value]) => {
      const given = Buffer.from(value, "hex");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

@Injectable()
export class PaddleWebhookVerifier extends WebhookVerifier {
  constructor(@Inject(PAYMENT_CONFIG) private readonly config: Pick<PaymentConfig, "webhookSecret">) {
    super();
  }

  verify(rawBody: Buffer | undefined, signatureHeader: string | undefined, now: Date): void {
    if (!verifyPaddleSignature(rawBody, signatureHeader, this.config.webhookSecret, now)) {
      throw new DomainError("UNAUTHORIZED", "Invalid webhook signature.");
    }
  }
}
