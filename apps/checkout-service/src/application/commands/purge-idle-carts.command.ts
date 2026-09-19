import { Command } from "@nestjs/cqrs";

export class PurgeIdleCartsCommand extends Command<{ purged: number }> {
  constructor() {
    super();
  }
}
