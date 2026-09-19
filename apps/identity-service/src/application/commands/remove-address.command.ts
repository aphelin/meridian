import { Command } from "@nestjs/cqrs";

export class RemoveAddressCommand extends Command<void> {
  constructor(
    readonly userId: string,
    readonly addressId: string,
  ) {
    super();
  }
}
