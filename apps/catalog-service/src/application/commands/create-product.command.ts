import type { ProductDto, ProductInput } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class CreateProductCommand extends Command<ProductDto> {
  constructor(readonly input: ProductInput) {
    super();
  }
}
