import type { UserDto } from "@meridian/contracts";
import { type Clock, CLOCK } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { UserName } from "../../domain";
import { UnitOfWork } from "../ports";
import { invalidSession } from "../services/account-errors";
import { toUserDto } from "../services/mappers";
import { UpdateProfileCommand } from "./update-profile.command";

@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler implements ICommandHandler<UpdateProfileCommand, UserDto> {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(command: UpdateProfileCommand): Promise<UserDto> {
    const name = UserName.parse(command.name);
    return this.uow.run(async (scope) => {
      const user = await scope.users.findById(command.userId);
      if (!user) throw invalidSession();
      if (user.rename(name, this.clock.now())) {
        await scope.users.save(user);
        await scope.outbox.publish(user.pullEvents());
      }
      return toUserDto(user);
    });
  }
}
