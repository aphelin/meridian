import type { AuthResultDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class LoginCommand extends Command<AuthResultDto> {
  constructor(
    readonly email: string,
    readonly password: string,
  ) {
    super();
  }
}
