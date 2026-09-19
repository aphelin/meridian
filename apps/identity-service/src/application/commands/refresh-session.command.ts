import type { AuthResultDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class RefreshSessionCommand extends Command<AuthResultDto> {
  constructor(readonly refreshToken: string) {
    super();
  }
}
