import { beforeEach, describe, expect, it } from "vitest";
import { identityHarness, tokenFromUrl } from "../testing/in-memory";
import { ChangePasswordCommand } from "./change-password.command";
import { ChangePasswordHandler } from "./change-password.handler";
import { LoginCommand } from "./login.command";
import { LoginHandler } from "./login.handler";
import { RefreshSessionCommand } from "./refresh-session.command";
import { RefreshSessionHandler } from "./refresh-session.handler";
import { RegisterUserCommand } from "./register-user.command";
import { RegisterUserHandler } from "./register-user.handler";
import { RequestPasswordResetCommand } from "./request-password-reset.command";
import { RequestPasswordResetHandler } from "./request-password-reset.handler";
import { ResetPasswordCommand } from "./reset-password.command";
import { ResetPasswordHandler } from "./reset-password.handler";

describe("forgot password, password reset and password change", () => {
  let h: ReturnType<typeof identityHarness>;
  let userId: string;
  let forgot: RequestPasswordResetHandler;
  let reset: ResetPasswordHandler;
  let change: ChangePasswordHandler;
  let login: LoginHandler;
  let refresh: RefreshSessionHandler;

  beforeEach(async () => {
    h = identityHarness();
    forgot = new RequestPasswordResetHandler(h.users, h.uow, h.emails, h.clock);
    reset = new ResetPasswordHandler(h.tokens, h.uow, h.hasher, h.emails, h.clock);
    change = new ChangePasswordHandler(h.users, h.uow, h.hasher, h.emails, h.clock);
    login = new LoginHandler(h.users, h.uow, h.hasher, h.sessions);
    refresh = new RefreshSessionHandler(h.uow, h.sessions, h.clock);
    const result = await new RegisterUserHandler(h.uow, h.hasher, h.sessions, h.emails, h.clock).execute(new RegisterUserCommand("nino@example.com", "longenough1", "Nino"));
    userId = result.user.id;
  });

  it("does not reveal unknown emails on forgot password: completes silently and queues no email", async () => {
    const before = h.store.outbox.length;
    await expect(forgot.execute(new RequestPasswordResetCommand("nobody@example.com"))).resolves.toBeUndefined();
    await expect(forgot.execute(new RequestPasswordResetCommand("garbage"))).resolves.toBeUndefined();
    expect(h.store.outbox).toHaveLength(before);
  });

  it("emails a password reset link built from PUBLIC_SITE_URL for a known account", async () => {
    await forgot.execute(new RequestPasswordResetCommand("NINO@example.com"));
    const [mail] = h.store.emails("password-reset");
    expect(mail.to.email).toBe("nino@example.com");
    expect(String(mail.data.resetUrl)).toMatch(/^https:\/\/shop\.example\/account\/reset-password\?token=/);
    expect(mail.data.name).toBe("Nino");
    expect(mail.dedupeKey).toMatch(/^password-reset:/);
  });

  it("reset password sets the new password, revokes every session, sends password-changed and burns the token", async () => {
    const session = await login.execute(new LoginCommand("nino@example.com", "longenough1"));
    await forgot.execute(new RequestPasswordResetCommand("nino@example.com"));
    const token = tokenFromUrl(h.store.emails("password-reset")[0].data.resetUrl);
    await reset.execute(new ResetPasswordCommand(token, "brand-new-pass-1"));
    expect(h.refreshTokens.active(userId)).toHaveLength(0);
    await expect(refresh.execute(new RefreshSessionCommand(session.refreshToken))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(login.execute(new LoginCommand("nino@example.com", "longenough1"))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(login.execute(new LoginCommand("nino@example.com", "brand-new-pass-1"))).resolves.toBeTruthy();
    expect(h.store.emails("password-changed")).toHaveLength(1);
    await expect(reset.execute(new ResetPasswordCommand(token, "another-pass-2"))).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("rejects a password reset token after one hour and a newer request supersedes the older link", async () => {
    await forgot.execute(new RequestPasswordResetCommand("nino@example.com"));
    await forgot.execute(new RequestPasswordResetCommand("nino@example.com"));
    const [first, second] = h.store.emails("password-reset").map((m) => tokenFromUrl(m.data.resetUrl));
    await expect(reset.execute(new ResetPasswordCommand(first, "brand-new-pass-1"))).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    h.clock.advance(60 * 60 * 1000);
    await expect(reset.execute(new ResetPasswordCommand(second, "brand-new-pass-1"))).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("password change with a wrong current password is FORBIDDEN (403, never 401) and changes nothing", async () => {
    await expect(change.execute(new ChangePasswordCommand(userId, "nope-nope-nope", "another-pass-22", null))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.store.users.get(userId)?.passwordHash).toBe("hashed:longenough1");
    expect(h.store.emails("password-changed")).toHaveLength(0);
  });

  it("password change keeps the caller's refresh token family and revokes the others", async () => {
    const mine = await login.execute(new LoginCommand("nino@example.com", "longenough1"));
    const other = await login.execute(new LoginCommand("nino@example.com", "longenough1"));
    await change.execute(new ChangePasswordCommand(userId, "longenough1", "another-pass-22", mine.refreshToken));
    await expect(refresh.execute(new RefreshSessionCommand(mine.refreshToken))).resolves.toBeTruthy();
    await expect(refresh.execute(new RefreshSessionCommand(other.refreshToken))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(h.store.emails("password-changed")).toMatchObject([{ to: { email: "nino@example.com" }, data: { name: "Nino" } }]);
  });

  it("password change without a refresh token, or with someone else's, revokes all sessions", async () => {
    const mine = await login.execute(new LoginCommand("nino@example.com", "longenough1"));
    await change.execute(new ChangePasswordCommand(userId, "longenough1", "another-pass-22", "foreign-token"));
    expect(h.refreshTokens.active(userId)).toHaveLength(0);
    await expect(refresh.execute(new RefreshSessionCommand(mine.refreshToken))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const keys = h.store.emails("password-changed").map((m) => m.dedupeKey);
    await change.execute(new ChangePasswordCommand(userId, "another-pass-22", "third-pass-333", null));
    expect(new Set([...keys, ...h.store.emails("password-changed").map((m) => m.dedupeKey)]).size).toBe(2);
  });
});
