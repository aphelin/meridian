import { afterEach, describe, expect, it } from "vitest";
import { PermanentError, isPermanentError, errorText } from "./errors";
import { decideRabbitFailure, interruptibleSleep, kafkaRetryDelay, outboxBackoffMs, republishableHeaders } from "./retry";

describe("retry tiers and dead-letter routing", () => {
  afterEach(() => {
    delete process.env.MESSAGING_NAMESPACE;
  });

  it("rabbit retry tiers: failed attempts 1-3 go to the retry queue of their delay", () => {
    const delays = [300, 600, 900];
    const decisions = [1, 2, 3].map((attempt) => decideRabbitFailure("notification.send-email", attempt, delays, false));
    expect(decisions.map((d) => d.action)).toEqual(["retry", "retry", "retry"]);
    expect(decisions.map((d) => (d.action === "retry" ? d.delayMs : 0))).toEqual([300, 600, 900]);
    expect(decisions[0]).toMatchObject({ exchange: "meridian.retry", routingKey: "notification.send-email.retry.300ms", attempts: 1 });
  });

  it("the 4th failed delivery goes to the dead letter queue (DLQ) with attempts 4", () => {
    const decision = decideRabbitFailure("notification.send-email", 4, [300, 600, 900], false);
    expect(decision).toMatchObject({ action: "dead-letter", reason: "exhausted", attempts: 4, exchange: "meridian.dlx", routingKey: "notification.send-email", queue: "notification.send-email.dlq" });
  });

  it("a permanent error goes to the DLQ on the first attempt, skipping retry tiers", () => {
    process.env.MESSAGING_NAMESPACE = "t-x";
    const decision = decideRabbitFailure("payment.refund", 1, [5000, 30000, 120000], true);
    expect(decision).toMatchObject({ action: "dead-letter", reason: "permanent", attempts: 1, queue: "t-x.payment.refund.dlq", routingKey: "t-x.payment.refund" });
  });

  it("permanent errors are recognised by class and by marker", () => {
    expect(isPermanentError(new PermanentError("bad payload"))).toBe(true);
    expect(isPermanentError(Object.assign(new Error("copy"), { permanent: true }))).toBe(true);
    expect(isPermanentError(new Error("transient"))).toBe(false);
    expect(errorText(new PermanentError("bad payload"))).toBe("PermanentError: bad payload");
    expect(errorText("x".repeat(20), 10)).toHaveLength(10);
  });

  it("kafka in-process retry schedule ends at the DLT after the last delay", () => {
    const delays = [100, 200, 300];
    expect([2, 3, 4, 5].map((attempt) => kafkaRetryDelay(attempt, delays))).toEqual([100, 200, 300, null]);
    expect(kafkaRetryDelay(2, [])).toBeNull();
  });

  it("outbox retry backoff doubles per attempt and caps at 30s", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => outboxBackoffMs(n))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(outboxBackoffMs(1000)).toBe(30000);
  });

  it("republished retry headers drop broker-owned x-death headers", () => {
    expect(republishableHeaders({ "x-death": [{}], "x-first-death-queue": "q", "x-attempts": 2, "x-correlation-id": "c" })).toEqual({ "x-attempts": 2, "x-correlation-id": "c" });
  });

  it("retry waits are interruptible and heartbeat while waiting", async () => {
    let beats = 0;
    let stop = false;
    const completed = await interruptibleSleep(30, () => false, async () => void beats++, 10);
    expect(completed).toBe(true);
    expect(beats).toBeGreaterThanOrEqual(2);
    setTimeout(() => (stop = true), 15);
    expect(await interruptibleSleep(5000, () => stop, undefined, 10)).toBe(false);
  });
});
