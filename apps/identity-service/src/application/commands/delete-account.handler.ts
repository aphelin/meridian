import { type Clock, CLOCK } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { PlainPassword, UserRepository } from "../../domain";
import { PasswordHasher, UnitOfWork } from "../ports";
import { AccountEmails } from "../services/account-emails";
import { invalidSession, wrongPassword } from "../services/account-errors";
import { DeleteAccountCommand } from "./delete-account.command";

/**
 * Deletes the account after password confirmation (wrong password = 403): erases user, addresses, sessions and tokens,
 * and in the same transaction writes UserDeleted (other contexts anonymise their data) and the account-deleted email.
 */
@CommandHandler(DeleteAccountCommand)
export class DeleteAccountHandler implements ICommandHandler<DeleteAccountCommand, void> {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(AccountEmails) private readonly emails: AccountEmails,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteAccountCommand): Promise<void> {
    const snapshot = await this.users.findById(command.userId);
    if (!snapshot) throw invalidSession();
    const password = typeof command.password === "string" && command.password.length <= PlainPassword.MAX ? command.password : "";
    if (!password || !(await this.hasher.verify(snapshot.passwordHash, password))) throw wrongPassword();

    await this.uow.run(async (scope) => {
      const user = await scope.users.findById(command.userId);
      if (!user) throw invalidSession();
      if (user.passwordHash !== snapshot.passwordHash) throw wrongPassword();
      user.delete(this.clock.now());
      await scope.outbox.publish(user.pullEvents());
      await this.emails.accountDeleted(scope, user);
      await scope.users.remove(user);
    });
  }
}
