import type { ImageUploadTicketDto, Page, ProductDto, ProductImageDto } from "@meridian/contracts";
import { AdminOnly, parseWith, ZodBody } from "@meridian/nest-kit";
import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { ArchiveProductCommand } from "../../application/commands/archive-product.command";
import { AttachProductImageCommand } from "../../application/commands/attach-product-image.command";
import { CreateImageUploadCommand } from "../../application/commands/create-image-upload.command";
import { CreateProductCommand } from "../../application/commands/create-product.command";
import { PublishProductCommand } from "../../application/commands/publish-product.command";
import { RemoveProductImageCommand } from "../../application/commands/remove-product-image.command";
import { ReplaceVariantsCommand } from "../../application/commands/replace-variants.command";
import { UpdateProductCommand } from "../../application/commands/update-product.command";
import { AdminGetProductQuery, AdminListProductsQuery } from "../../application/queries/catalog.queries";
import { adminProductListQuerySchema, attachImageSchema, productIdSchema, productInputSchema, productPatchSchema, uploadUrlSchema, variantListSchema } from "./schemas";
import type { z } from "zod";

const id = (value: string) => parseWith(productIdSchema, value);

/** Admin product lifecycle: drafts, variants, publish/archive and images uploaded straight to object storage. */
@Controller("admin/products")
@AdminOnly()
export class AdminProductsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@Query() query: unknown): Promise<Page<ProductDto>> {
    const q = parseWith(adminProductListQuerySchema, query);
    return this.queryBus.execute(new AdminListProductsQuery({ status: q.status, q: q.q, cursor: q.cursor, limit: q.limit }));
  }

  @Get(":id")
  get(@Param("id") productId: string): Promise<ProductDto> {
    return this.queryBus.execute(new AdminGetProductQuery(id(productId)));
  }

  @Post()
  create(@ZodBody(productInputSchema) body: z.output<typeof productInputSchema>): Promise<ProductDto> {
    return this.commandBus.execute(new CreateProductCommand(body));
  }

  @Patch(":id")
  update(@Param("id") productId: string, @ZodBody(productPatchSchema) body: z.output<typeof productPatchSchema>): Promise<ProductDto> {
    return this.commandBus.execute(new UpdateProductCommand(id(productId), body));
  }

  @Put(":id/variants")
  variants(@Param("id") productId: string, @ZodBody(variantListSchema) body: z.output<typeof variantListSchema>): Promise<ProductDto> {
    return this.commandBus.execute(new ReplaceVariantsCommand(id(productId), body));
  }

  @Post(":id/publish")
  @HttpCode(200)
  publish(@Param("id") productId: string): Promise<ProductDto> {
    return this.commandBus.execute(new PublishProductCommand(id(productId)));
  }

  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id") productId: string): Promise<ProductDto> {
    return this.commandBus.execute(new ArchiveProductCommand(id(productId)));
  }

  @Post(":id/images/upload-url")
  uploadUrl(@Param("id") productId: string, @ZodBody(uploadUrlSchema) body: z.output<typeof uploadUrlSchema>): Promise<ImageUploadTicketDto> {
    return this.commandBus.execute(new CreateImageUploadCommand(id(productId), body.contentType, body.fileName));
  }

  @Post(":id/images")
  attachImage(@Param("id") productId: string, @ZodBody(attachImageSchema) body: z.output<typeof attachImageSchema>): Promise<ProductImageDto> {
    return this.commandBus.execute(new AttachProductImageCommand(id(productId), body.objectKey, body.alt));
  }

  @Delete(":id/images/:imageId")
  @HttpCode(204)
  async removeImage(@Param("id") productId: string, @Param("imageId") imageId: string): Promise<void> {
    await this.commandBus.execute(new RemoveProductImageCommand(id(productId), id(imageId)));
  }
}
