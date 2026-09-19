import { createHmac, timingSafeEqual } from "node:crypto";
import { isDevelopmentEnv, jwtSecret } from "./secrets";

const TOKEN_LENGTH = 32;

/** ORDER_LINK_SECRET, or in development/test a key derived from the JWT secret so local links keep working. */
export function orderLinkSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.ORDER_LINK_SECRET?.trim();
  if (secret) return secret;
  if (!isDevelopmentEnv(env)) throw new Error(`ORDER_LINK_SECRET must be set when NODE_ENV=${env.NODE_ENV}`);
  // Derived rather than reused so a leaked order link never reveals material usable to forge JWTs.
  return createHmac("sha256", jwtSecret(env)).update("meridian:order-link").digest("base64url");
}

/** Guest order access token: base64url(HMAC-SHA256(ORDER_LINK_SECRET, orderId)) truncated to 32 characters. */
export function orderAccessToken(orderId: string, env: NodeJS.ProcessEnv = process.env): string {
  return createHmac("sha256", orderLinkSecret(env)).update(orderId).digest("base64url").slice(0, TOKEN_LENGTH);
}

export function verifyOrderAccessToken(orderId: string, token: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  if (typeof orderId !== "string" || !orderId || typeof token !== "string" || token.length !== TOKEN_LENGTH) return false;
  const expected = Buffer.from(orderAccessToken(orderId, env));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
