import type { AuthResultDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class RegisterUserCommand extends Command<AuthResultDto> {
  constructor(
    readonly email: string,
    readonly password: string,
    readonly name: string,
  ) {
    super();
  }
}
