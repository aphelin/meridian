import { createHmac, randomBytes } from "node:crypto";
import { cfg } from "./env";

/** HS256 JWT signed with the stack JWT_SECRET, as issued by identity-service or used between services. */
export function mintJwt(claims: Record<string, unknown>, ttlSec = 900): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iat: now, exp: now + ttlSec, ...claims });
  const sig = createHmac("sha256", cfg.jwtSecret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export const tokens = {
  admin: (sub = "system-tests-admin") => mintJwt({ sub, role: "admin", email: `${sub}@system-tests.meridian.local` }),
  service: (sub = "system-tests") => mintJwt({ sub, role: "service" }, 300),
  customer: (sub = `sys_cust_${randomBytes(4).toString("hex")}`) => mintJwt({ sub, role: "customer", email: `${sub}@system-tests.meridian.local` }),
};

/** Guest order link token, same derivation as the kit (`orderAccessToken`). */
export function orderAccessToken(orderId: string): string {
  return createHmac("sha256", cfg.orderLinkSecret).update(orderId).digest("base64url").slice(0, 32);
}
