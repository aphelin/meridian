import type { ImageUploadTicketDto } from "@meridian/contracts";
import { NotFoundError } from "@meridian/kernel";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";
import { imageObjectKey, UPLOAD_URL_TTL_SECONDS } from "../../domain/product/product-image";
import { ProductRepository } from "../../domain/product/product.repository";
import { MediaStorage } from "../ports/media-storage";
import { CreateImageUploadCommand } from "./create-image-upload.command";

/** Issues a short-lived presigned PUT so the admin browser uploads the image straight to object storage. */
@CommandHandler(CreateImageUploadCommand)
export class CreateImageUploadHandler implements ICommandHandler<CreateImageUploadCommand, ImageUploadTicketDto> {
  constructor(
    private readonly products: ProductRepository,
    private readonly storage: MediaStorage,
  ) {}

  async execute({ productId, contentType }: CreateImageUploadCommand): Promise<ImageUploadTicketDto> {
    const objectKey = imageObjectKey(productId, randomUUID(), contentType);
    if (!(await this.products.findById(productId))) throw new NotFoundError("Product not found.");
    const normalized = contentType.toLowerCase().split(";")[0].trim();
    const { uploadUrl, expiresAt } = await this.storage.createUploadUrl(objectKey, normalized, UPLOAD_URL_TTL_SECONDS);
    return { uploadUrl, objectKey, publicUrl: this.storage.publicUrl(objectKey), expiresAt: expiresAt.toISOString() };
  }
}
