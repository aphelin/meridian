import { beforeEach, describe, expect, it } from "vitest";
import { identityHarness, tokenFromUrl } from "../testing/in-memory";
import { RegisterUserCommand } from "./register-user.command";
import { RegisterUserHandler } from "./register-user.handler";
import { ResendVerificationCommand } from "./resend-verification.command";
import { ResendVerificationHandler } from "./resend-verification.handler";
import { VerifyEmailCommand } from "./verify-email.command";
import { VerifyEmailHandler } from "./verify-email.handler";

describe("registration and email verification", () => {
  let h: ReturnType<typeof identityHarness>;
  let register: RegisterUserHandler;
  let verify: VerifyEmailHandler;
  let resend: ResendVerificationHandler;

  beforeEach(() => {
    h = identityHarness();
    register = new RegisterUserHandler(h.uow, h.hasher, h.sessions, h.emails, h.clock);
    verify = new VerifyEmailHandler(h.uow, h.clock);
    resend = new ResendVerificationHandler(h.uow, h.emails, h.clock);
  });

  it("registers, signs in and writes UserRegistered plus a verify-email command in one transaction", async () => {
    const result = await register.execute(new RegisterUserCommand("Nino@Example.com", "longenough1", "Nino"));
    expect(result.user).toMatchObject({ email: "nino@example.com", emailVerified: false, role: "customer" });
    expect(result.accessToken).toBe(`access:${result.user.id}:customer`);
    expect(result.refreshToken).toBeTruthy();
    expect(h.uow.runs).toBe(1);
    expect(h.store.users.get(result.user.id)?.passwordHash).toBe("hashed:longenough1");
    expect(h.store.events("UserRegistered")).toMatchObject([{ aggregateId: result.user.id, payload: { email: "nino@example.com", name: "Nino" } }]);
    const [mail] = h.store.emails("verify-email");
    expect(mail.to).toEqual({ email: "nino@example.com", name: "Nino" });
    expect(String(mail.data.verifyUrl)).toMatch(/^https:\/\/shop\.example\/account\/verify-email\?token=[A-Za-z0-9_-]{43}$/);
    expect(mail.dedupeKey).toMatch(/^verify-email:/);
  });

  it("rejects a duplicate email case-insensitively with CONFLICT and writes nothing", async () => {
    await register.execute(new RegisterUserCommand("nino@example.com", "longenough1", "Nino"));
    const outboxBefore = h.store.outbox.length;
    await expect(register.execute(new RegisterUserCommand("NINO@EXAMPLE.COM", "longenough1", "Other"))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.store.outbox).toHaveLength(outboxBefore);
    expect(h.store.users.size).toBe(1);
  });

  it("verifies the email with the emailed token, raises UserEmailVerified, and refuses the token a second time", async () => {
    const { user } = await register.execute(new RegisterUserCommand("nino@example.com", "longenough1", "Nino"));
    const token = tokenFromUrl(h.store.emails("verify-email")[0].data.verifyUrl);
    const verified = await verify.execute(new VerifyEmailCommand(token));
    expect(verified).toMatchObject({ id: user.id, emailVerified: true });
    expect(h.store.events("UserEmailVerified")).toMatchObject([{ payload: { userId: user.id, email: "nino@example.com" } }]);
    await expect(verify.execute(new VerifyEmailCommand(token))).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("rejects an expired verification token after 24 hours with TOKEN_EXPIRED", async () => {
    await register.execute(new RegisterUserCommand("nino@example.com", "longenough1", "Nino"));
    const token = tokenFromUrl(h.store.emails("verify-email")[0].data.verifyUrl);
    h.clock.advance(24 * 60 * 60 * 1000 + 1);
    await expect(verify.execute(new VerifyEmailCommand(token))).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    await expect(verify.execute(new VerifyEmailCommand("forged"))).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("resends verification with a new link that supersedes the old one, and is a no-op once verified", async () => {
    const { user } = await register.execute(new RegisterUserCommand("nino@example.com", "longenough1", "Nino"));
    const oldToken = tokenFromUrl(h.store.emails("verify-email")[0].data.verifyUrl);
    await resend.execute(new ResendVerificationCommand(user.id));
    const mails = h.store.emails("verify-email");
    expect(mails).toHaveLength(2);
    expect(new Set(mails.map((m) => m.dedupeKey)).size).toBe(2);
    await expect(verify.execute(new VerifyEmailCommand(oldToken))).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    await verify.execute(new VerifyEmailCommand(tokenFromUrl(mails[1].data.verifyUrl)));
    await resend.execute(new ResendVerificationCommand(user.id));
    expect(h.store.emails("verify-email")).toHaveLength(2);
  });
});
