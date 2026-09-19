import type { UserDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class UpdateProfileCommand extends Command<UserDto> {
  constructor(
    readonly userId: string,
    readonly name: string,
  ) {
    super();
  }
}
