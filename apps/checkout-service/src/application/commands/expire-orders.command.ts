import { Command } from "@nestjs/cqrs";

export class ExpireOrdersCommand extends Command<{ expired: number }> {
  constructor(
    /** Expire unpaid orders placed at least this long ago; defaults to ORDER_HOLD_MINUTES. */
    readonly olderThanSeconds?: number,
  ) {
    super();
  }
}
