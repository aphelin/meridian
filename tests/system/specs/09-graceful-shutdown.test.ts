import { afterAll, describe, expect, test } from "vitest";
import { tokens } from "../support/auth";
import { withChaos } from "../support/chaos";
import { CAPTCHA_TOKEN } from "../support/env";
import { newCorrelationId, notification, request } from "../support/http";
import { mailsTo, waitForMail } from "../support/mailhog";
import { commandQueue, liveQueueCounts, rabbitQueue } from "../support/rabbit";
import { type Replica, startReplica, stopAllReplicas } from "../support/replica";
import { emailDeliveries, uniqueEmail } from "../support/shop";
import { waitFor } from "../support/wait";

describe("graceful shutdown", () => {
  afterAll(async () => {
    await stopAllReplicas();
  });

  test("graceful shutdown: SIGTERM to a notification-service replica with in-flight send-email commands finishes them, exits 0, and every email is handled exactly once", async () => {
    const queue = commandQueue("notification.send-email");
    let replica: Replica | null = null;
    try {
      replica = await startReplica("notification-service");
      const r = replica;
      await waitFor(async () => (await liveQueueCounts(queue)).consumers === 2, "send-email queue to have the stack consumer and the replica", { timeoutMs: 60_000 });
      const ready = await request(r.url, "GET", "/health/ready");
      expect(ready.status).toBe(200);

      const recipients = Array.from({ length: 6 }, (_, i) => ({ email: uniqueEmail(`shutdown${i}`), correlationId: newCorrelationId(`shutdown${i}`) }));
      let sigtermAt = 0;
      let exit: Awaited<ReturnType<Replica["stop"]>> | null = null;
      // every send-email handler waits 7 s before running, so both consumers hold unacknowledged deliveries at SIGTERM
      // (shorter than the 10 s per-hook shutdown budget, longer than publishing six commands)
      await withChaos("notification-service", { target: "handler:rabbit:notification.send-email", fault: "delay", delayMs: 7000, rate: 1, ttlSec: 90 }, async () => {
        const subscribed = await Promise.all(recipients.map((x) => notification().post("/newsletter/subscriptions", { email: x.email }, { headers: { "x-captcha-token": CAPTCHA_TOKEN }, correlationId: x.correlationId })));
        for (const res of subscribed) expect(res.status, res.text).toBe(202);
        // outbox relayed all six and none is waiting in the queue: all are delivered to the two consumers (round-robin)
        await waitFor(async () => {
          const status = await notification().get("/admin/messaging", { token: tokens.admin() });
          return status.json?.outbox?.pending === 0 && (await liveQueueCounts(queue)).ready === 0;
        }, "six in-flight deliveries split across both consumers", { timeoutMs: 5000, intervalMs: 100 });
        const handledBefore = r.logLines().filter((l) => l.msg === "message handled").length;
        expect(handledBefore).toBe(0);

        sigtermAt = Date.now();
        const stopping = r.stop("SIGTERM", 40_000);
        // readiness flips while draining (or the listener is already closed)
        const draining = await request(r.url, "GET", "/health/ready", { timeoutMs: 2000 }).catch(() => null);
        if (draining) expect(draining.status).toBe(503);
        exit = await stopping;
      });

      expect(exit).not.toBeNull();
      expect(exit!.timedOut, r.log().slice(-2000)).toBe(false);
      expect(exit!.code, r.log().slice(-2000)).toBe(0);

      // the replica finished its in-flight handlers after SIGTERM, before "shutdown complete"
      const lines = r.logLines();
      const ours = new Set(recipients.map((x) => x.correlationId));
      const handledByReplica = lines.filter((l) => l.msg === "message handled" && l.transport === "rabbit" && ours.has(l.correlationId));
      expect(handledByReplica.length, "replica held in-flight commands at SIGTERM").toBeGreaterThanOrEqual(1);
      const completeAt = Date.parse(lines.find((l) => l.msg === "shutdown complete")?.time ?? "");
      expect(Number.isNaN(completeAt)).toBe(false);
      for (const l of handledByReplica) {
        expect(Date.parse(l.time)).toBeGreaterThanOrEqual(sigtermAt);
        expect(Date.parse(l.time)).toBeLessThanOrEqual(completeAt);
      }

      // exactly once: one email and one sent delivery row with a single attempt per recipient, queue drained
      for (const x of recipients) {
        await waitForMail(x.email, (m) => /newsletter\/confirm\?token=/.test(m.body), "newsletter confirmation", 60_000);
        const rows = await waitFor(async () => {
          const d = await emailDeliveries(x.email, { template: "newsletter-confirm" });
          return d.length === 1 && d[0].status === "sent" ? d : null;
        }, `sent delivery row for ${x.email}`);
        expect(rows[0]).toMatchObject({ attempts: 1, correlationId: x.correlationId });
      }
      await waitFor(async () => {
        const q = await rabbitQueue(queue);
        const live = await liveQueueCounts(queue);
        return q.messages_unacknowledged === 0 && live.ready === 0 && live.consumers === 1;
      }, "queue drained with only the stack consumer left");
      for (const x of recipients) expect(await mailsTo(x.email)).toHaveLength(1);
    } finally {
      if (replica) await replica.stop("SIGKILL", 5000);
    }
  });
});
