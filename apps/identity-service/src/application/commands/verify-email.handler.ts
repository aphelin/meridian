import type { UserDto } from "@meridian/contracts";
import { type Clock, CLOCK } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { hashSecret, tokenInvalidError } from "../../domain";
import { UnitOfWork } from "../ports";
import { toUserDto } from "../services/mappers";
import { VerifyEmailCommand } from "./verify-email.command";

/** Consumes a single-use verification token and marks the email verified (UserEmailVerified). */
@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler implements ICommandHandler<VerifyEmailCommand, UserDto> {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(command: VerifyEmailCommand): Promise<UserDto> {
    return this.uow.run(async (scope) => {
      const token = await scope.tokens.findByHash(hashSecret(command.token));
      if (!token) throw tokenInvalidError();
      // Lock order everywhere: user row first, then its tokens.
      const user = await scope.users.findById(token.userId);
      if (!user) throw tokenInvalidError();
      const now = this.clock.now();
      token.consume("verify-email", now);
      if (!(await scope.tokens.markUsed(token))) throw tokenInvalidError();
      if (user.verifyEmail(now)) {
        // Any other verification link still in an inbox is now pointless; retire it.
        await scope.tokens.invalidateOutstanding(user.id, "verify-email", now);
        await scope.users.save(user);
      }
      await scope.outbox.publish(user.pullEvents());
      return toUserDto(user);
    });
  }
}
