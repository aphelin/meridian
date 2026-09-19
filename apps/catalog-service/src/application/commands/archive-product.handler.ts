import type { ProductDto } from "@meridian/contracts";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ProductWrites } from "../services/product-writes";
import { ArchiveProductCommand } from "./archive-product.command";

/** Withdraws a product from sale and announces it with ProductArchived. */
@CommandHandler(ArchiveProductCommand)
export class ArchiveProductHandler implements ICommandHandler<ArchiveProductCommand, ProductDto> {
  constructor(
    private readonly writes: ProductWrites,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ productId }: ArchiveProductCommand): Promise<ProductDto> {
    await this.writes.change(productId, (product) => product.archive(this.clock.now()));
    return this.writes.dto(productId);
  }
}
