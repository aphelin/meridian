import type { ProductDto } from "@meridian/contracts";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ProductWrites } from "../services/product-writes";
import { PublishProductCommand } from "./publish-product.command";

/** Makes a product visible to shoppers and announces it with ProductPublished (full snapshot). */
@CommandHandler(PublishProductCommand)
export class PublishProductHandler implements ICommandHandler<PublishProductCommand, ProductDto> {
  constructor(
    private readonly writes: ProductWrites,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ productId }: PublishProductCommand): Promise<ProductDto> {
    await this.writes.change(productId, (product) => product.publish(this.clock.now()));
    return this.writes.dto(productId);
  }
}
