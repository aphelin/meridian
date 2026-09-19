import type { UserDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class VerifyEmailCommand extends Command<UserDto> {
  constructor(readonly token: string) {
    super();
  }
}
