import type { AuthResultDto } from "@meridian/contracts";
import { type Clock, CLOCK, ConflictError, Email } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";
import { OneTimeToken, PlainPassword, User, UserName } from "../../domain";
import { PasswordHasher, UnitOfWork } from "../ports";
import { AccountEmails } from "../services/account-emails";
import { SessionIssuer } from "../services/session-issuer";
import { RegisterUserCommand } from "./register-user.command";

/** Creates an unverified customer, signs them in and queues the verification email, atomically. */
@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand, AuthResultDto> {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionIssuer) private readonly sessions: SessionIssuer,
    @Inject(AccountEmails) private readonly emails: AccountEmails,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RegisterUserCommand): Promise<AuthResultDto> {
    const email = Email.parse(command.email);
    const name = UserName.parse(command.name);
    const password = PlainPassword.parse(command.password);
    const passwordHash = await this.hasher.hash(password.value);

    return this.uow.run(async (scope) => {
      if (await scope.users.findByEmail(email)) throw duplicate();
      const now = this.clock.now();
      const user = User.register({ id: randomUUID(), email, name, passwordHash, now });
      await scope.users.add(user);
      const { token, secret } = OneTimeToken.issue({ id: randomUUID(), userId: user.id, purpose: "verify-email", now });
      await scope.tokens.add(token);
      await scope.outbox.publish(user.pullEvents());
      await this.emails.verifyEmail(scope, user, token, secret);
      return this.sessions.start(scope, user);
    });
  }
}

export const duplicate = () => new ConflictError("An account with this email already exists.");
