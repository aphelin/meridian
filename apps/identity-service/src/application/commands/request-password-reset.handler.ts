import { type Clock, CLOCK, Email } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";
import { OneTimeToken, UserRepository } from "../../domain";
import { UnitOfWork } from "../ports";
import { AccountEmails } from "../services/account-emails";
import { RequestPasswordResetCommand } from "./request-password-reset.command";

/**
 * Forgot password. Completes silently for unknown or malformed emails so the endpoint cannot be used to discover
 * accounts; for a real account it supersedes older reset links and queues a 1-hour link.
 */
@CommandHandler(RequestPasswordResetCommand)
export class RequestPasswordResetHandler implements ICommandHandler<RequestPasswordResetCommand, void> {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(AccountEmails) private readonly emails: AccountEmails,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RequestPasswordResetCommand): Promise<void> {
    let email: Email;
    try {
      email = Email.parse(command.email);
    } catch {
      return;
    }
    const known = await this.users.findByEmail(email);
    if (!known) return;
    await this.uow.run(async (scope) => {
      const user = await scope.users.findById(known.id);
      if (!user) return;
      const now = this.clock.now();
      await scope.tokens.invalidateOutstanding(user.id, "password-reset", now);
      const { token, secret } = OneTimeToken.issue({ id: randomUUID(), userId: user.id, purpose: "password-reset", now });
      await scope.tokens.add(token);
      await this.emails.passwordReset(scope, user, token, secret);
    });
  }
}
