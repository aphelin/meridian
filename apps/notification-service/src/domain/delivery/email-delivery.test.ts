import { describe, expect, it } from "vitest";
import { EmailAddress } from "../shared/email-address";
import { DeliveryInFlightError, EmailDelivery } from "./email-delivery";

const t0 = new Date("2026-09-17T10:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

const queued = (dedupeKey = "order-confirmation:ord_1") =>
  EmailDelivery.queue({ id: "eml_1", dedupeKey, template: "order-confirmation", to: EmailAddress.parse(" Ada@Example.COM "), toName: "Ada", subject: "[Meridian sandbox] Order M-1 confirmed", correlationId: "corr-1", now: t0 });

describe("EmailDelivery aggregate", () => {
  it("normalises the recipient and starts queued without attempts", () => {
    const d = queued();
    expect(d.snapshot()).toMatchObject({ toEmail: "ada@example.com", status: "queued", attempts: 0, lastError: null });
  });

  it("rejects dedupe keys with whitespace or excessive length", () => {
    expect(() => queued("has\u0000control")).toThrow(/dedupeKey/);
    expect(() => queued("x".repeat(201))).toThrow(/dedupeKey/);
  });

  it("marks sent after an attempt and raises EmailSent once", () => {
    const d = queued();
    d.beginAttempt(t0, 45_000);
    d.markSent(later(100), "<1@relay>");
    d.markSent(later(200), "<1@relay>");
    expect(d.status).toBe("sent");
    expect(d.pullEvents()).toEqual([expect.objectContaining({ name: "EmailSent", payload: { deliveryId: "eml_1", template: "order-confirmation", to: "ada@example.com" } })]);
  });

  it("a sent delivery is settled: duplicate attempts are refused", () => {
    const d = queued();
    d.beginAttempt(t0, 45_000);
    d.markSent(t0, null);
    expect(d.isSettled).toBe(true);
    expect(() => d.beginAttempt(later(1), 45_000)).toThrow(/already sent/);
  });

  it("refuses a second concurrent attempt while the lease is held, and allows it after expiry", () => {
    const d = queued();
    d.beginAttempt(t0, 45_000);
    expect(() => d.beginAttempt(later(1_000), 45_000)).toThrow(DeliveryInFlightError);
    d.beginAttempt(later(46_000), 45_000);
    expect(d.attempts).toBe(2);
  });

  it("records failures on every attempt and dead-letters on the final one", () => {
    const d = queued();
    for (let attempt = 1; attempt <= 4; attempt++) {
      d.beginAttempt(later(attempt), 45_000);
      d.recordFailure("ECONNREFUSED", attempt === 4, later(attempt));
    }
    expect(d.snapshot()).toMatchObject({ status: "dead-lettered", attempts: 4, lastError: "ECONNREFUSED", leaseUntil: null });
    expect(d.pullEvents().map((e) => e.name)).toEqual(["EmailDeadLettered"]);
  });

  it("a dead-lettered delivery replayed successfully is marked sent", () => {
    const d = queued();
    d.beginAttempt(t0, 45_000);
    d.recordFailure("boom", true, t0);
    d.pullEvents();
    d.beginAttempt(later(10), 45_000);
    d.markSent(later(20), null);
    expect(d.snapshot()).toMatchObject({ status: "sent", attempts: 2 });
    expect(d.pullEvents().map((e) => e.name)).toEqual(["EmailSent"]);
  });

  it("suppresses only before any attempt", () => {
    const d = queued();
    d.suppress("undeliverable", t0);
    expect(d.status).toBe("suppressed");
    const e = queued();
    e.beginAttempt(t0, 1000);
    expect(() => e.suppress("late", t0)).toThrow(/suppressed/);
  });

  it("truncates long error messages", () => {
    const d = queued();
    d.beginAttempt(t0, 1000);
    d.recordFailure("x".repeat(2000), false, t0);
    expect(d.lastError!.length).toBe(500);
    expect(d.status).toBe("failed");
  });
});

describe("EmailAddress", () => {
  it("validates and flags reserved undeliverable domains", () => {
    expect(EmailAddress.parse("deleted-u1@anonymised.invalid").isUndeliverable).toBe(true);
    expect(EmailAddress.parse("buyer@probe.test").isUndeliverable).toBe(false);
    expect(() => EmailAddress.parse("not-an-email")).toThrow(/valid email/);
    expect(() => EmailAddress.parse("a@b.c\r\nBcc: x@y.z")).toThrow(/valid email/);
  });
});

describe("EmailDelivery attempt counting", () => {
  it("never counts fewer attempts than the broker delivered", () => {
    const d = queued();
    d.beginAttempt(t0, 1000, 3);
    expect(d.attempts).toBe(3);
    d.recordFailure("x", false, t0);
    d.beginAttempt(later(2000), 1000, 1);
    expect(d.attempts).toBe(4);
  });
});
