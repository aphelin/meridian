import type { ProductDto } from "@meridian/contracts";
import { CLOCK, type Clock, ConflictError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";
import { ReferenceDataRepository } from "../../domain/catalog/reference-data.repository";
import { Product } from "../../domain/product/product";
import { ProductRepository } from "../../domain/product/product.repository";
import { TransactionRunner } from "../ports/transaction";
import { ProductEventWriter } from "../services/product-event-writer";
import { ProductWrites } from "../services/product-writes";
import { assertKnownReferences } from "../services/reference-checks";
import { CreateProductCommand } from "./create-product.command";

/** Admin creates a draft product. Drafts are invisible to shoppers and raise no events until published. */
@CommandHandler(CreateProductCommand)
export class CreateProductHandler implements ICommandHandler<CreateProductCommand, ProductDto> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly products: ProductRepository,
    private readonly referenceData: ReferenceDataRepository,
    private readonly events: ProductEventWriter,
    private readonly writes: ProductWrites,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ input }: CreateProductCommand): Promise<ProductDto> {
    const product = Product.createDraft(`prd_${randomUUID()}`, input, this.clock.now());
    await this.transactions.run(async (tx) => {
      await assertKnownReferences(this.referenceData, tx, { categoryId: input.categoryId, materials: input.materials });
      if (await this.products.slugOwner(product.slug, tx)) throw new ConflictError(`The slug "${product.slug}" is already in use.`, { slug: product.slug });
      await this.products.save(product, tx);
      await this.events.write(tx, product);
    });
    return this.writes.dto(product.id);
  }
}
