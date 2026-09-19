import { type Clock, CLOCK, Email, ValidationError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";
import { PlainPassword, User, UserName } from "../../domain";
import { IdentitySettings, PasswordHasher, UnitOfWork } from "../ports";
import { SeedAdminCommand, type SeedAdminResult } from "./seed-admin.command";

/**
 * Idempotent development seed: ensures a verified admin exists with ADMIN_EMAIL / ADMIN_PASSWORD. Re-running with
 * unchanged configuration changes nothing; a changed password or role is corrected and old sessions are revoked.
 */
@CommandHandler(SeedAdminCommand)
export class SeedAdminHandler implements ICommandHandler<SeedAdminCommand, SeedAdminResult> {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(IdentitySettings) private readonly settings: IdentitySettings,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<SeedAdminResult> {
    const admin = this.settings.admin;
    if (!admin) throw new ValidationError("ADMIN_EMAIL and ADMIN_PASSWORD must be configured to seed the admin.");
    const email = Email.parse(admin.email);
    const password = PlainPassword.parse(admin.password);
    const freshHash = await this.hasher.hash(password.value);

    return this.uow.run(async (scope) => {
      const now = this.clock.now();
      const existing = await scope.users.findByEmail(email);
      if (!existing) {
        const user = User.register({ id: randomUUID(), email, name: UserName.parse("Meridian Admin"), passwordHash: freshHash, role: "admin", now });
        user.verifyEmail(now);
        await scope.users.add(user);
        await scope.outbox.publish(user.pullEvents());
        return { ok: true, admin: { id: user.id, email: user.email, role: "admin", created: true } };
      }
      const promoted = existing.promoteToAdmin();
      const passwordMatches = await this.hasher.verify(existing.passwordHash, password.value);
      if (!passwordMatches) existing.changePasswordHash(freshHash);
      const verified = existing.verifyEmail(now);
      if (promoted || !passwordMatches || verified) {
        await scope.users.save(existing);
        await scope.outbox.publish(existing.pullEvents());
      }
      // Sessions minted under the old role or password must not survive the correction.
      if (promoted || !passwordMatches) await scope.sessions.revokeAllForUser(existing.id, now);
      return { ok: true, admin: { id: existing.id, email: existing.email, role: "admin", created: false } };
    });
  }
}
