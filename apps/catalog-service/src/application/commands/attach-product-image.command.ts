import type { ProductImageDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class AttachProductImageCommand extends Command<ProductImageDto> {
  constructor(
    readonly productId: string,
    readonly objectKey: string,
    readonly alt: string,
  ) {
    super();
  }
}
