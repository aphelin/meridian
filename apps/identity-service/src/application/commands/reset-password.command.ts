import { Command } from "@nestjs/cqrs";

export class ResetPasswordCommand extends Command<void> {
  constructor(
    readonly token: string,
    readonly password: string,
  ) {
    super();
  }
}
