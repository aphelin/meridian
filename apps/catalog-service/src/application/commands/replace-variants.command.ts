import type { ProductDto, VariantInput } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class ReplaceVariantsCommand extends Command<ProductDto> {
  constructor(
    readonly productId: string,
    readonly variants: VariantInput[],
  ) {
    super();
  }
}
