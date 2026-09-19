import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PaddleWebhookVerifier, verifyPaddleSignature } from "./paddle-webhook-verifier";

const secret = "pdl_ntfset_unit";
const body = Buffer.from(JSON.stringify({ notification_id: "ntf_1", event_type: "transaction.completed" }));
const now = new Date("2026-09-17T10:00:00Z");
const ts = Math.floor(now.getTime() / 1000);
const sign = (t: number, raw: Buffer, key = secret) => `ts=${t};h1=${createHmac("sha256", key).update(`${t}:`).update(raw).digest("hex")}`;

describe("Paddle webhook signature", () => {
  it("accepts a valid h1 signature within tolerance", () => {
    expect(verifyPaddleSignature(body, sign(ts, body), secret, now)).toBe(true);
    expect(verifyPaddleSignature(body, `${sign(ts, body, "old")};h1=${sign(ts, body).split("h1=")[1]}`, secret, now)).toBe(true);
  });

  it("rejects a wrong secret, a tampered body and a missing header", () => {
    expect(verifyPaddleSignature(body, sign(ts, body, "wrong"), secret, now)).toBe(false);
    expect(verifyPaddleSignature(Buffer.from(`${body} `), sign(ts, body), secret, now)).toBe(false);
    expect(verifyPaddleSignature(body, undefined, secret, now)).toBe(false);
    expect(verifyPaddleSignature(body, "garbage", secret, now)).toBe(false);
  });

  it("rejects signatures older than 5 minutes and when no webhook secret is configured", () => {
    expect(verifyPaddleSignature(body, sign(ts - 301, body), secret, now)).toBe(false);
    expect(verifyPaddleSignature(body, sign(ts - 299, body), secret, now)).toBe(true);
    expect(verifyPaddleSignature(body, sign(ts, body), null, now)).toBe(false);
  });

  it("the verifier throws UNAUTHORIZED for a bad webhook signature", () => {
    const verifier = new PaddleWebhookVerifier({ webhookSecret: secret });
    expect(() => verifier.verify(body, sign(ts, body, "wrong"), now)).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(() => verifier.verify(body, sign(ts, body), now)).not.toThrow();
  });
});
