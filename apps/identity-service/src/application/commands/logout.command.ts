import { Command } from "@nestjs/cqrs";

export class LogoutCommand extends Command<void> {
  constructor(readonly refreshToken: string | null) {
    super();
  }
}
