import type { ProductDto, ProductInput } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class UpdateProductCommand extends Command<ProductDto> {
  constructor(
    readonly productId: string,
    readonly patch: Partial<ProductInput>,
  ) {
    super();
  }
}
