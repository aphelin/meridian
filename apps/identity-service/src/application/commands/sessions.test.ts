import { beforeEach, describe, expect, it } from "vitest";
import { identityHarness } from "../testing/in-memory";
import { LoginCommand } from "./login.command";
import { LoginHandler } from "./login.handler";
import { LogoutCommand } from "./logout.command";
import { LogoutHandler } from "./logout.handler";
import { RefreshSessionCommand } from "./refresh-session.command";
import { RefreshSessionHandler } from "./refresh-session.handler";
import { RegisterUserCommand } from "./register-user.command";
import { RegisterUserHandler } from "./register-user.handler";

describe("login, refresh token rotation and logout", () => {
  let h: ReturnType<typeof identityHarness>;
  let login: LoginHandler;
  let refresh: RefreshSessionHandler;
  let logout: LogoutHandler;

  beforeEach(async () => {
    h = identityHarness();
    login = new LoginHandler(h.users, h.uow, h.hasher, h.sessions);
    refresh = new RefreshSessionHandler(h.uow, h.sessions, h.clock);
    logout = new LogoutHandler(h.uow, h.clock);
    await new RegisterUserHandler(h.uow, h.hasher, h.sessions, h.emails, h.clock).execute(new RegisterUserCommand("nino@example.com", "longenough1", "Nino"));
  });

  it("logs in with the right password regardless of email case", async () => {
    const result = await login.execute(new LoginCommand(" NINO@example.com ", "longenough1"));
    expect(result.user.email).toBe("nino@example.com");
  });

  it("answers the same 401 for a wrong password and an unknown email, spending a decoy hash check on unknown emails", async () => {
    await expect(login.execute(new LoginCommand("nino@example.com", "wrong-password"))).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email or password." });
    expect(h.hasher.decoyChecks).toBe(0);
    await expect(login.execute(new LoginCommand("nobody@example.com", "wrong-password"))).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email or password." });
    await expect(login.execute(new LoginCommand("not an email", "wrong-password"))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(h.hasher.decoyChecks).toBe(2);
  });

  it("rotates the refresh token within the same family", async () => {
    const session = await login.execute(new LoginCommand("nino@example.com", "longenough1"));
    const rotated = await refresh.execute(new RefreshSessionCommand(session.refreshToken));
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    const families = new Set(h.refreshTokens.active(session.user.id).map((t) => t.familyId));
    expect(families.size).toBe(2); // registration session + this login's family
  });

  it("revokes the whole family when a rotated refresh token is replayed, and the revocation survives the 401", async () => {
    const session = await login.execute(new LoginCommand("nino@example.com", "longenough1"));
    const rotated = await refresh.execute(new RefreshSessionCommand(session.refreshToken));
    await expect(refresh.execute(new RefreshSessionCommand(session.refreshToken))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(refresh.execute(new RefreshSessionCommand(rotated.refreshToken))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(h.refreshTokens.active(session.user.id)).toHaveLength(1);
  });

  it("rejects an expired refresh token", async () => {
    const session = await login.execute(new LoginCommand("nino@example.com", "longenough1"));
    h.clock.advance(h.settings.refreshTokenTtlMs);
    await expect(refresh.execute(new RefreshSessionCommand(session.refreshToken))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("logout revokes the refresh token family and ignores unknown tokens", async () => {
    const session = await login.execute(new LoginCommand("nino@example.com", "longenough1"));
    await logout.execute(new LogoutCommand(session.refreshToken));
    await logout.execute(new LogoutCommand("unknown"));
    await logout.execute(new LogoutCommand(null));
    await expect(refresh.execute(new RefreshSessionCommand(session.refreshToken))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
