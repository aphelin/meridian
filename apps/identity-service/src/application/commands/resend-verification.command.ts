import { Command } from "@nestjs/cqrs";

export class ResendVerificationCommand extends Command<void> {
  constructor(readonly userId: string) {
    super();
  }
}
