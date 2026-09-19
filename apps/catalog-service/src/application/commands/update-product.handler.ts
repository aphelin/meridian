import type { ProductDto } from "@meridian/contracts";
import { CLOCK, type Clock, ConflictError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ReferenceDataRepository } from "../../domain/catalog/reference-data.repository";
import { ProductRepository } from "../../domain/product/product.repository";
import { ProductWrites } from "../services/product-writes";
import { assertKnownReferences } from "../services/reference-checks";
import { UpdateProductCommand } from "./update-product.command";

/** Admin edits product content; a published product announces the changed fields with ProductUpdated. */
@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand, ProductDto> {
  constructor(
    private readonly writes: ProductWrites,
    private readonly products: ProductRepository,
    private readonly referenceData: ReferenceDataRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ productId, patch }: UpdateProductCommand): Promise<ProductDto> {
    await this.writes.change(productId, async (product, tx) => {
      await assertKnownReferences(this.referenceData, tx, { categoryId: patch.categoryId, materials: patch.materials });
      const changed = product.revise(patch, this.clock.now());
      if (changed.includes("slug")) {
        const owner = await this.products.slugOwner(product.slug, tx);
        if (owner && owner !== product.id) throw new ConflictError(`The slug "${product.slug}" is already in use.`, { slug: product.slug });
      }
    });
    return this.writes.dto(productId);
  }
}
