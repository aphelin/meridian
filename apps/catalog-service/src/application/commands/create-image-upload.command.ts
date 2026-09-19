import type { ImageUploadTicketDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class CreateImageUploadCommand extends Command<ImageUploadTicketDto> {
  constructor(
    readonly productId: string,
    readonly contentType: string,
    readonly fileName: string,
  ) {
    super();
  }
}
