import { Command } from "@nestjs/cqrs";

export class AnonymiseCustomerCommand extends Command<{ orders: number }> {
  constructor(
    readonly messageId: string,
    readonly userId: string,
  ) {
    super();
  }
}
