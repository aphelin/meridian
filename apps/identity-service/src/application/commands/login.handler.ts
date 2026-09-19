import type { AuthResultDto } from "@meridian/contracts";
import { Email } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { PlainPassword, type User, UserRepository } from "../../domain";
import { PasswordHasher, UnitOfWork } from "../ports";
import { invalidCredentials } from "../services/account-errors";
import { SessionIssuer } from "../services/session-issuer";
import { LoginCommand } from "./login.command";

/**
 * Password sign-in. Every failure path performs exactly one argon2 verification (real or decoy) and answers the same
 * 401, so response time and body reveal nothing about which emails are registered.
 */
@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, AuthResultDto> {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionIssuer) private readonly sessions: SessionIssuer,
  ) {}

  async execute(command: LoginCommand): Promise<AuthResultDto> {
    const user = await this.lookup(command.email);
    const acceptable = typeof command.password === "string" && command.password.length > 0 && command.password.length <= PlainPassword.MAX;
    if (!user || !acceptable) {
      await this.hasher.verifyDecoy(acceptable ? command.password : "");
      throw invalidCredentials();
    }
    if (!(await this.hasher.verify(user.passwordHash, command.password))) throw invalidCredentials();

    return this.uow.run(async (scope) => {
      // Re-read under lock: the account may have been deleted between verification and session creation.
      const current = await scope.users.findById(user.id);
      if (!current || current.passwordHash !== user.passwordHash) throw invalidCredentials();
      return this.sessions.start(scope, current);
    });
  }

  private async lookup(raw: string): Promise<User | null> {
    let email: Email;
    try {
      email = Email.parse(raw);
    } catch {
      return null;
    }
    return this.users.findByEmail(email);
  }
}
