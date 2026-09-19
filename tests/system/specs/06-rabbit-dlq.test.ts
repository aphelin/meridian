import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tokens } from "../support/auth";
import { clearChaos, withChaos } from "../support/chaos";
import { CAPTCHA_TOKEN } from "../support/env";
import { newCorrelationId, notification } from "../support/http";
import { type KafkaTap, kafkaTap } from "../support/kafka";
import { mailsTo, waitForMail } from "../support/mailhog";
import { commandQueue, rabbitQueue } from "../support/rabbit";
import { emailDeliveries, uniqueEmail } from "../support/shop";
import { waitFor } from "../support/wait";

describe("RabbitMQ dead letters", () => {
  let tap: KafkaTap;
  beforeAll(async () => {
    tap = await kafkaTap(["meridian.notification"]);
  });
  afterAll(async () => {
    await tap?.stop();
  });

  test("Rabbit DLQ: with chaos on smtp.send a send-email command exhausts its retry tiers into the DLQ; after the fault clears, replay delivers it once", async () => {
    const admin = tokens.admin();
    const email = uniqueEmail("dlq");
    const canary = uniqueEmail("dlq-canary");
    const correlationId = newCorrelationId("dlq");
    const dlqName = `${commandQueue("notification.send-email")}.dlq`;

    const deadLetter = await withChaos("notification-service", { target: "smtp.send", fault: "fail", rate: 1, ttlSec: 120 }, async () => {
      // a real email-producing request: newsletter double opt-in → outbox → notification.send-email
      const sub = await notification().post("/newsletter/subscriptions", { email }, { headers: { "x-captcha-token": CAPTCHA_TOKEN }, correlationId });
      expect(sub.status, sub.text).toBe(202);

      // every attempt fails at the SMTP adapter; the final attempt marks the delivery dead-lettered
      const row = await waitFor(async () => (await emailDeliveries(email, { template: "newsletter-confirm" })).find((d) => d.status === "dead-lettered"), "EmailDelivery marked dead-lettered", { timeoutMs: 60_000, intervalMs: 1000 });
      expect(row.attempts).toBe(4);
      expect(row.lastError).toBeTruthy();
      expect(row.correlationId).toBe(correlationId);
      await tap.find("EmailDeadLettered", (e) => e.payload.to === email, "EmailDeadLettered event");

      // the command is parked on the DLQ, visible through the admin API with its attempts and correlation id
      const entry = await waitFor(async () => {
        const r = await notification().get(`/admin/messaging/dead-letters?source=rabbit&queueOrTopic=${encodeURIComponent(dlqName)}&limit=100`, { token: admin });
        return r.status === 200 ? (r.json as any[]).find((d) => d.payload?.to?.email === email) : null;
      }, "dead letter listing to include the email command");
      expect(entry).toMatchObject({ source: "rabbit", name: "notification.send-email", correlationId, attempts: 4 });
      // RabbitMQ management statistics refresh on an interval, so poll the DLQ depth instead of reading it once
      await waitFor(async () => (await rabbitQueue(dlqName)).messages >= 1, "DLQ depth reported by RabbitMQ management", { timeoutMs: 30_000, intervalMs: 1000 });
      expect(await mailsTo(email)).toHaveLength(0);

      // fix the fault, then prove the pipeline is healthy again with a canary before replaying
      await clearChaos("notification-service", "smtp.send");
      // the injected failures also opened the smtp breaker; wait until it lets calls through again (BREAKER_RESET_MS)
      await waitFor(async () => {
        const b = await notification().get("/admin/breakers", { token: admin });
        const smtp = (b.json as { name: string; state: string }[]).find((x) => x.name === "smtp");
        return smtp && smtp.state !== "open";
      }, "smtp breaker to leave the open state", { timeoutMs: 30_000 });
      const canarySub = await notification().post("/newsletter/subscriptions", { email: canary }, { headers: { "x-captcha-token": CAPTCHA_TOKEN } });
      expect(canarySub.status, canarySub.text).toBe(202);
      await waitForMail(canary, (m) => /newsletter\/confirm\?token=/.test(m.body), "canary email after the fault cleared", 60_000);
      return entry as { id: string; queueOrTopic: string };
    });

    const replay = await notification().post("/admin/messaging/replay", { source: "rabbit", queueOrTopic: deadLetter.queueOrTopic, ids: [deadLetter.id] }, { token: admin });
    expect(replay.status, replay.text).toBeLessThan(300);
    expect(replay.json.replayed).toBe(1);

    const mail = await waitForMail(email, (m) => /newsletter\/confirm\?token=/.test(m.body), "replayed confirmation email");
    expect(mail.subject).toContain("[Meridian sandbox]");
    await waitFor(async () => (await emailDeliveries(email, { template: "newsletter-confirm" })).find((d) => d.status === "sent"), "delivery row marked sent after replay");
    const listing = await notification().get(`/admin/messaging/dead-letters?source=rabbit&queueOrTopic=${encodeURIComponent(dlqName)}&limit=100`, { token: admin });
    expect((listing.json as any[]).some((d) => d.id === deadLetter.id)).toBe(false);
    await tap.find("EmailSent", (e) => e.payload.to === email, "EmailSent after replay");
    expect(await mailsTo(email)).toHaveLength(1);
    expect((await emailDeliveries(email, { template: "newsletter-confirm" }))).toHaveLength(1);
  });
});
