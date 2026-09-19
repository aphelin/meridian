import { CLOCK, type Clock } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { MediaStorage } from "../ports/media-storage";
import { ProductWrites } from "../services/product-writes";
import { RemoveProductImageCommand } from "./remove-product-image.command";

const log = createLogger("RemoveProductImage");

/** Detaches an image, then deletes the object after the commit (an orphaned object is harmless; a dangling row is not). */
@CommandHandler(RemoveProductImageCommand)
export class RemoveProductImageHandler implements ICommandHandler<RemoveProductImageCommand, void> {
  constructor(
    private readonly writes: ProductWrites,
    private readonly storage: MediaStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ productId, imageId }: RemoveProductImageCommand): Promise<void> {
    const removed = await this.writes.change(productId, (product) => product.removeImage(imageId, this.clock.now()));
    await this.storage.delete(removed.objectKey).catch((error: unknown) => log.warn("image object not deleted; left orphaned", { objectKey: removed.objectKey, error }));
  }
}
