import type { ProductImageDto } from "@meridian/contracts";
import { CLOCK, type Clock, NotFoundError } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";
import { assertImageKeyFor, assertUploadedImage, ProductImage } from "../../domain/product/product-image";
import { ProductRepository } from "../../domain/product/product.repository";
import { MediaStorage } from "../ports/media-storage";
import { ProductWrites } from "../services/product-writes";
import { AttachProductImageCommand } from "./attach-product-image.command";

const log = createLogger("AttachProductImage");

/**
 * Confirms an upload: the key must belong to this product, the object must exist (HEAD) and be an image of at most
 * 8 MB. Invalid uploads are deleted. Storage is checked before the database transaction so no row lock waits on S3.
 */
@CommandHandler(AttachProductImageCommand)
export class AttachProductImageHandler implements ICommandHandler<AttachProductImageCommand, ProductImageDto> {
  constructor(
    private readonly writes: ProductWrites,
    private readonly products: ProductRepository,
    private readonly storage: MediaStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ productId, objectKey, alt }: AttachProductImageCommand): Promise<ProductImageDto> {
    if (!(await this.products.findById(productId))) throw new NotFoundError("Product not found.");
    assertImageKeyFor(productId, objectKey);
    const stored = await this.storage.stat(objectKey);
    if (!stored) throw new NotFoundError("The uploaded image was not found. Upload it again.");
    try {
      assertUploadedImage(stored);
    } catch (error) {
      await this.storage.delete(objectKey).catch((e: unknown) => log.warn("could not delete rejected upload", { objectKey, error: e }));
      throw error;
    }
    const now = this.clock.now();
    const image = await this.writes.change(productId, (product) =>
      product.addImage(ProductImage.create({ id: `img_${randomUUID()}`, objectKey, url: this.storage.publicUrl(objectKey), alt, position: 0, createdAt: now }), now),
    );
    return { id: image.id, url: image.url, alt: image.alt, position: image.position };
  }
}
