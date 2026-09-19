import { Command } from "@nestjs/cqrs";

export class ClearCartCommand extends Command<void> {
  constructor(
    readonly userId: string | null,
    readonly cartId: string | null,
  ) {
    super();
  }
}
