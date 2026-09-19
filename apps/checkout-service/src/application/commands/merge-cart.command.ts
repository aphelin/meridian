import type { CartDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class MergeCartCommand extends Command<CartDto> {
  constructor(
    readonly userId: string,
    readonly guestCartId: string | null,
  ) {
    super();
  }
}
