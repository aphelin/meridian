import { type Clock, CLOCK } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { hashSecret, OneTimeTokenRepository, PlainPassword, tokenInvalidError } from "../../domain";
import { PasswordHasher, UnitOfWork } from "../ports";
import { AccountEmails } from "../services/account-emails";
import { ResetPasswordCommand } from "./reset-password.command";

/** Consumes a reset token, sets the new password, revokes every session and notifies the owner. */
@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler implements ICommandHandler<ResetPasswordCommand, void> {
  constructor(
    @Inject(OneTimeTokenRepository) private readonly tokens: OneTimeTokenRepository,
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(AccountEmails) private readonly emails: AccountEmails,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    const password = PlainPassword.parse(command.password);
    const tokenHash = hashSecret(command.token);
    // Reject bad links before paying for a password hash.
    const candidate = await this.tokens.findByHash(tokenHash);
    if (!candidate) throw tokenInvalidError();
    candidate.consume("password-reset", this.clock.now());
    const passwordHash = await this.hasher.hash(password.value);

    await this.uow.run(async (scope) => {
      const token = await scope.tokens.findByHash(tokenHash);
      if (!token) throw tokenInvalidError();
      const user = await scope.users.findById(token.userId);
      if (!user) throw tokenInvalidError();
      const now = this.clock.now();
      token.consume("password-reset", now);
      if (!(await scope.tokens.markUsed(token))) throw tokenInvalidError();
      user.changePasswordHash(passwordHash);
      await scope.users.save(user);
      await scope.tokens.invalidateOutstanding(user.id, "password-reset", now);
      await scope.sessions.revokeAllForUser(user.id, now);
      await this.emails.passwordChanged(scope, user);
    });
  }
}
