import { Command } from "@nestjs/cqrs";

export class RequestPasswordResetCommand extends Command<void> {
  constructor(readonly email: string) {
    super();
  }
}
