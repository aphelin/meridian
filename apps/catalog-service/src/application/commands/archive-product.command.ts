import type { ProductDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class ArchiveProductCommand extends Command<ProductDto> {
  constructor(readonly productId: string) {
    super();
  }
}
