import { type Clock, CLOCK } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { hashSecret } from "../../domain";
import { UnitOfWork } from "../ports";
import { LogoutCommand } from "./logout.command";

/** Ends the session family of the presented refresh token. Idempotent; unknown tokens are ignored. */
@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand, void> {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: LogoutCommand): Promise<void> {
    if (!command.refreshToken) return;
    const refreshToken = command.refreshToken;
    await this.uow.run(async (scope) => {
      const token = await scope.sessions.findByHash(hashSecret(refreshToken));
      if (token) await scope.sessions.revokeFamily(token.familyId, this.clock.now());
    });
  }
}
