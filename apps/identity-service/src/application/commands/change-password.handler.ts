import { type Clock, CLOCK, ConflictError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { hashSecret, PlainPassword, UserRepository } from "../../domain";
import { PasswordHasher, UnitOfWork } from "../ports";
import { AccountEmails } from "../services/account-emails";
import { invalidSession, wrongPassword } from "../services/account-errors";
import { ChangePasswordCommand } from "./change-password.command";

/**
 * Changes the password after re-authentication (wrong current password = 403). Revokes all other session families,
 * keeping the caller's family when its refresh token is supplied and still active, and sends password-changed.
 */
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand, void> {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(AccountEmails) private readonly emails: AccountEmails,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<void> {
    const next = PlainPassword.parse(command.newPassword);
    const snapshot = await this.users.findById(command.userId);
    if (!snapshot) throw invalidSession();
    const current = typeof command.currentPassword === "string" && command.currentPassword.length <= PlainPassword.MAX ? command.currentPassword : "";
    if (!current || !(await this.hasher.verify(snapshot.passwordHash, current))) throw wrongPassword();
    const passwordHash = await this.hasher.hash(next.value);

    await this.uow.run(async (scope) => {
      const user = await scope.users.findById(command.userId);
      if (!user) throw invalidSession();
      // The hash we verified against must still be current (no concurrent change or reset in between).
      if (user.passwordHash !== snapshot.passwordHash) throw new ConflictError("Your password was changed in the meantime. Please try again.");
      const now = this.clock.now();
      user.changePasswordHash(passwordHash);
      await scope.users.save(user);

      let keepFamilyId: string | null = null;
      if (command.refreshToken) {
        const token = await scope.sessions.findByHash(hashSecret(command.refreshToken));
        if (token?.isActiveFor(user.id, now)) keepFamilyId = token.familyId;
      }
      await scope.sessions.revokeAllForUser(user.id, now, keepFamilyId);
      await scope.tokens.invalidateOutstanding(user.id, "password-reset", now);
      await this.emails.passwordChanged(scope, user);
    });
  }
}
