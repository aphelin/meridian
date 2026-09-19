import type { AuthResultDto } from "@meridian/contracts";
import { type Clock, CLOCK } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { RefreshTokenRotation } from "../../domain";
import { UnitOfWork } from "../ports";
import { invalidSession } from "../services/account-errors";
import { SessionIssuer } from "../services/session-issuer";
import { RefreshSessionCommand } from "./refresh-session.command";

/** Rotates a refresh token. Reuse of a rotated token revokes the family; the revocation commits before the 401. */
@CommandHandler(RefreshSessionCommand)
export class RefreshSessionHandler implements ICommandHandler<RefreshSessionCommand, AuthResultDto> {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(SessionIssuer) private readonly sessions: SessionIssuer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RefreshSessionCommand): Promise<AuthResultDto> {
    const result = await this.uow.run(async (scope) => {
      const outcome = await new RefreshTokenRotation(scope.sessions).rotate(command.refreshToken, this.clock.now());
      if (outcome.kind !== "rotated") return null;
      const user = await scope.users.findById(outcome.userId);
      if (!user) return null;
      return this.sessions.start(scope, user, outcome.familyId);
    });
    if (!result) throw invalidSession();
    return result;
  }
}
