import { Command } from "@nestjs/cqrs";

export class RemoveProductImageCommand extends Command<void> {
  constructor(
    readonly productId: string,
    readonly imageId: string,
  ) {
    super();
  }
}
