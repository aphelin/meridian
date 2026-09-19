import type { ProductDto } from "@meridian/contracts";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ReferenceDataRepository } from "../../domain/catalog/reference-data.repository";
import { ProductRepository } from "../../domain/product/product.repository";
import { assertSkusAvailable } from "../../domain/product/sku-policy";
import { ProductWrites } from "../services/product-writes";
import { assertKnownReferences } from "../services/reference-checks";
import { ReplaceVariantsCommand } from "./replace-variants.command";

/** Admin replaces a product's variants. SKUs owned by another product are refused with 409. */
@CommandHandler(ReplaceVariantsCommand)
export class ReplaceVariantsHandler implements ICommandHandler<ReplaceVariantsCommand, ProductDto> {
  constructor(
    private readonly writes: ProductWrites,
    private readonly products: ProductRepository,
    private readonly referenceData: ReferenceDataRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ productId, variants }: ReplaceVariantsCommand): Promise<ProductDto> {
    await this.writes.change(productId, async (product, tx) => {
      product.replaceVariants(variants, this.clock.now());
      const skus = product.variants.map((v) => v.sku);
      assertSkusAvailable(product.id, skus, await this.products.skuOwners(skus, tx));
      await assertKnownReferences(this.referenceData, tx, { variantMaterials: product.variants.map((v) => v.material) });
    });
    return this.writes.dto(productId);
  }
}
