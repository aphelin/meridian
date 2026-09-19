import { FixedClock } from "@meridian/kernel";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeMailer, FakeRenderer, InMemoryUnitOfWork, SequentialIds, testSettings } from "../../test-support/in-memory";
import { MailRejectedError, TemplateDataError } from "../ports";
import { EmailSendFailedError, SendEmailCommand } from "./send-email.command";
import { SendEmailHandler } from "./send-email.handler";

const clock = new FixedClock(new Date("2026-09-17T10:00:00Z"));

function command(overrides: { dedupeKey?: string; email?: string; attempt?: number; template?: "password-changed" | "order-confirmation" } = {}) {
  return new SendEmailCommand(overrides.template ?? "password-changed", { email: overrides.email ?? "ada@example.com", name: "Ada" }, { name: "Ada" }, overrides.dedupeKey ?? "pwd-changed:1", {
    correlationId: "corr-1",
    messageId: "msg-1",
    attempt: overrides.attempt ?? 1,
    maxAttempts: 4,
  });
}

describe("SendEmailHandler", () => {
  let uow: InMemoryUnitOfWork;
  let mailer: FakeMailer;
  let handler: SendEmailHandler;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    mailer = new FakeMailer();
    handler = new SendEmailHandler(uow, mailer, new FakeRenderer(), new SequentialIds(), clock, testSettings);
    SendEmailHandler.inFlightWaitsMs = [10, 20, 40, 80];
    SendEmailHandler.recordRetriesMs = [1, 1];
  });

  it("renders the template, sends it with correlation headers and records EmailSent", async () => {
    const result = await handler.execute(command());
    expect(result.outcome).toBe("sent");
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ subject: "[Meridian sandbox] password-changed", headers: { "X-Correlation-Id": "corr-1" } });
    expect(uow.delivery("pwd-changed:1")).toMatchObject({ status: "sent", attempts: 1, correlationId: "corr-1" });
    expect(uow.events("EmailSent")).toHaveLength(1);
  });

  it("dedupe: the same dedupeKey sends once and the duplicate is suppressed", async () => {
    await handler.execute(command());
    const second = await handler.execute(command());
    expect(second.outcome).toBe("duplicate");
    expect(mailer.sent).toHaveLength(1);
  });

  it("dedupe: a duplicate arriving while the first is still sending waits and does not send twice", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mailer.onSend = async () => {
      mailer.onSend = undefined;
      await gate;
    };
    const first = handler.execute(command());
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = handler.execute(command());
    setTimeout(release, 8);
    const results = await Promise.all([first, second]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["duplicate", "sent"]);
    expect(mailer.sent).toHaveLength(1);
  });

  it("records a transient SMTP failure and rethrows it as retryable", async () => {
    mailer.failures.push(new Error("connect ECONNREFUSED"));
    const error = await handler.execute(command({ attempt: 1 })).catch((e) => e);
    expect(error).toBeInstanceOf(EmailSendFailedError);
    expect(error.permanent).toBe(false);
    expect(uow.delivery("pwd-changed:1")).toMatchObject({ status: "failed", attempts: 1, lastError: "Error: connect ECONNREFUSED" });
  });

  it("dead-letters on the final attempt and writes EmailDeadLettered, then a replay marks it sent", async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      mailer.failures.push(new Error("smtp down"));
      await expect(handler.execute(command({ attempt }))).rejects.toBeInstanceOf(EmailSendFailedError);
    }
    expect(uow.delivery("pwd-changed:1")).toMatchObject({ status: "dead-lettered", attempts: 4 });
    expect(uow.events("EmailDeadLettered")).toHaveLength(1);

    const replay = await handler.execute(command({ attempt: 1 }));
    expect(replay.outcome).toBe("sent");
    expect(uow.delivery("pwd-changed:1")).toMatchObject({ status: "sent", attempts: 5 });
  });

  it("a permanent SMTP rejection dead-letters immediately", async () => {
    mailer.failures.push(new MailRejectedError("550 no such user", 550));
    const error = await handler.execute(command({ attempt: 1 })).catch((e) => e);
    expect(error.permanent).toBe(true);
    expect(uow.delivery("pwd-changed:1")?.status).toBe("dead-lettered");
  });

  it("invalid template data is recorded as dead-lettered without sending", async () => {
    handler = new SendEmailHandler(uow, mailer, new FakeRenderer((t) => new TemplateDataError(t, ["resetUrl: required"])), new SequentialIds(), clock, testSettings);
    const error = await handler.execute(command()).catch((e) => e);
    expect(error).toMatchObject({ permanent: true });
    expect(mailer.sent).toHaveLength(0);
    expect(uow.delivery("pwd-changed:1")).toMatchObject({ status: "dead-lettered" });
  });

  it("suppresses mail to anonymised .invalid addresses", async () => {
    const result = await handler.execute(command({ email: "deleted-usr_1@anonymised.invalid" }));
    expect(result.outcome).toBe("suppressed");
    expect(mailer.sent).toHaveLength(0);
    expect(uow.delivery("pwd-changed:1")?.status).toBe("suppressed");
  });

  it("retries the bookkeeping transaction after a successful send instead of resending", async () => {
    let calls = 0;
    const original = uow.run.bind(uow);
    uow.run = ((work) => {
      calls++;
      if (calls === 2) uow.failNext = 1;
      return original(work);
    }) as typeof uow.run;
    const result = await handler.execute(command());
    expect(result.outcome).toBe("sent");
    expect(mailer.sent).toHaveLength(1);
    expect(uow.delivery("pwd-changed:1")?.status).toBe("sent");
  });
});
