import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { StripeSignatureVerifier } from "./stripe-webhook-verifier";

const SECRET = "whsec_unit_test_secret";
const now = new Date("2026-09-18T10:00:00Z");
const nowSec = Math.floor(now.getTime() / 1000);

const payload = JSON.stringify({
  id: "evt_1",
  object: "event",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_1", object: "payment_intent", amount: 1000, currency: "eur", metadata: { paymentId: "pay_1" } } },
});
const sign = (body: string, secret = SECRET, timestamp = nowSec) => Stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp });
const verifier = (secret: string | null = SECRET) => new StripeSignatureVerifier({ stripe: secret === null ? null : ({ webhookSecret: secret } as never) });

describe("StripeSignatureVerifier", () => {
  it("accepts a correctly signed event and returns it", () => {
    const event = verifier().verify(Buffer.from(payload), sign(payload), now);
    expect(event).toMatchObject({ id: "evt_1", type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } });
  });

  it("rejects a wrong secret, a tampered body, a missing header and a missing body with UNAUTHORIZED", () => {
    const v = verifier();
    const cases: [Buffer | undefined, string | undefined][] = [
      [Buffer.from(payload), sign(payload, "whsec_wrong")],
      [Buffer.from(payload.replace("1000", "1")), sign(payload)],
      [Buffer.from(payload), undefined],
      [undefined, sign(payload)],
      [Buffer.from(payload), "t=1,v1=deadbeef"],
    ];
    for (const [body, header] of cases) expect(() => v.verify(body, header, now)).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });

  it("rejects a signature older than five minutes (replay)", () => {
    expect(() => verifier().verify(Buffer.from(payload), sign(payload, SECRET, nowSec - 301), now)).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(() => verifier().verify(Buffer.from(payload), sign(payload, SECRET, nowSec - 120), now)).not.toThrow();
  });

  it("refuses every event when no webhook secret is configured", () => {
    expect(() => verifier(null).verify(Buffer.from(payload), sign(payload), now)).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });
});
