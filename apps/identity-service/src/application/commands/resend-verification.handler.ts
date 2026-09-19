import { type Clock, CLOCK } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";
import { OneTimeToken } from "../../domain";
import { UnitOfWork } from "../ports";
import { AccountEmails } from "../services/account-emails";
import { invalidSession } from "../services/account-errors";
import { ResendVerificationCommand } from "./resend-verification.command";

/** Issues a fresh verification link (older links stop working). No-op for verified accounts. */
@CommandHandler(ResendVerificationCommand)
export class ResendVerificationHandler implements ICommandHandler<ResendVerificationCommand, void> {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(AccountEmails) private readonly emails: AccountEmails,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ResendVerificationCommand): Promise<void> {
    await this.uow.run(async (scope) => {
      const user = await scope.users.findById(command.userId);
      if (!user) throw invalidSession();
      if (user.emailVerified) return;
      const now = this.clock.now();
      await scope.tokens.invalidateOutstanding(user.id, "verify-email", now);
      const { token, secret } = OneTimeToken.issue({ id: randomUUID(), userId: user.id, purpose: "verify-email", now });
      await scope.tokens.add(token);
      await this.emails.verifyEmail(scope, user, token, secret);
    });
  }
}
