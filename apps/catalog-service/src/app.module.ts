import { CLOCK, SystemClock } from "@meridian/kernel";
import { jwtModule, KitModule, MessagingModule } from "@meridian/nest-kit";
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { ArchiveProductHandler } from "./application/commands/archive-product.handler";
import { AttachProductImageHandler } from "./application/commands/attach-product-image.handler";
import { CreateImageUploadHandler } from "./application/commands/create-image-upload.handler";
import { CreateProductHandler } from "./application/commands/create-product.handler";
import { PostReviewHandler } from "./application/commands/post-review.handler";
import { PublishProductHandler } from "./application/commands/publish-product.handler";
import { ForgetUserHandler, RecordPurchasesHandler } from "./application/commands/purchases.handlers";
import { RemoveProductImageHandler } from "./application/commands/remove-product-image.handler";
import { ReplaceVariantsHandler } from "./application/commands/replace-variants.handler";
import { SeedCatalogHandler } from "./application/commands/seed-catalog.handler";
import { UpdateProductHandler } from "./application/commands/update-product.handler";
import { AddToWishlistHandler, RemoveFromWishlistHandler, ReplaceWishlistHandler } from "./application/commands/wishlist.handlers";
import { CatalogPurchasesConsumer } from "./application/event-handlers/catalog-purchases.consumer";
import { CatalogCache } from "./application/ports/catalog-cache";
import { CatalogReadModel } from "./application/ports/catalog-read-model";
import { CatalogSeedSource } from "./application/ports/catalog-seed-source";
import { MediaStorage } from "./application/ports/media-storage";
import { TransactionRunner } from "./application/ports/transaction";
import {
  AdminGetProductHandler,
  AdminListProductsHandler,
  GetCatalogSnapshotHandler,
  GetPricesHandler,
  GetProductHandler,
  ListCategoriesHandler,
  ListMaterialsHandler,
  ListProductsHandler,
} from "./application/queries/catalog.handlers";
import { GetReviewEligibilityHandler, GetWishlistHandler, ListReviewsHandler } from "./application/queries/engagement.handlers";
import { ProductEventWriter } from "./application/services/product-event-writer";
import { ProductWrites } from "./application/services/product-writes";
import { ReferenceDataRepository } from "./domain/catalog/reference-data.repository";
import { ProductRepository } from "./domain/product/product.repository";
import { PurchaseRecordRepository, ReviewRepository } from "./domain/review/review.repository";
import { WishlistRepository } from "./domain/wishlist/wishlist.repository";
import { RedisCatalogCache } from "./infrastructure/cache/redis-catalog-cache";
import { PrismaTransactionRunner } from "./infrastructure/persistence/prisma-transaction-runner";
import { PrismaService } from "./infrastructure/persistence/prisma.service";
import { ProductPrismaRepository } from "./infrastructure/persistence/product.prisma-repository";
import { ReferenceDataPrismaRepository } from "./infrastructure/persistence/reference-data.prisma-repository";
import { PurchaseRecordPrismaRepository, ReviewPrismaRepository } from "./infrastructure/persistence/review.prisma-repository";
import { WishlistPrismaRepository } from "./infrastructure/persistence/wishlist.prisma-repository";
import { CatalogPrismaReadModel } from "./infrastructure/read-model/catalog.prisma-read-model";
import { StorefrontCatalogSeedSource } from "./infrastructure/seed/catalog-seed-source";
import { S3MediaStorage } from "./infrastructure/storage/s3-media-storage";
import { AdminProductsController } from "./presentation/http/admin-products.controller";
import { CatalogController } from "./presentation/http/catalog.controller";
import { ReviewsController } from "./presentation/http/reviews.controller";
import { SeedController } from "./presentation/http/seed.controller";
import { WishlistController } from "./presentation/http/wishlist.controller";

export const SERVICE_NAME = "catalog-service";

const commandHandlers = [
  CreateProductHandler,
  UpdateProductHandler,
  ReplaceVariantsHandler,
  PublishProductHandler,
  ArchiveProductHandler,
  CreateImageUploadHandler,
  AttachProductImageHandler,
  RemoveProductImageHandler,
  PostReviewHandler,
  ReplaceWishlistHandler,
  AddToWishlistHandler,
  RemoveFromWishlistHandler,
  RecordPurchasesHandler,
  ForgetUserHandler,
  SeedCatalogHandler,
];

const queryHandlers = [
  GetCatalogSnapshotHandler,
  ListCategoriesHandler,
  ListMaterialsHandler,
  ListProductsHandler,
  GetProductHandler,
  GetPricesHandler,
  AdminListProductsHandler,
  AdminGetProductHandler,
  ListReviewsHandler,
  GetReviewEligibilityHandler,
  GetWishlistHandler,
];

@Module({
  imports: [
    CqrsModule.forRoot(),
    jwtModule(),
    KitModule.forRoot({ service: SERVICE_NAME }),
    MessagingModule.forRoot({ service: SERVICE_NAME, prisma: PrismaService, kafka: true, rabbit: false, relay: true }),
  ],
  controllers: [CatalogController, ReviewsController, WishlistController, AdminProductsController, SeedController],
  providers: [
    PrismaService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: TransactionRunner, useClass: PrismaTransactionRunner },
    { provide: ProductRepository, useClass: ProductPrismaRepository },
    { provide: ReferenceDataRepository, useClass: ReferenceDataPrismaRepository },
    { provide: ReviewRepository, useClass: ReviewPrismaRepository },
    { provide: PurchaseRecordRepository, useClass: PurchaseRecordPrismaRepository },
    { provide: WishlistRepository, useClass: WishlistPrismaRepository },
    { provide: CatalogReadModel, useClass: CatalogPrismaReadModel },
    { provide: CatalogCache, useClass: RedisCatalogCache },
    { provide: MediaStorage, useClass: S3MediaStorage },
    { provide: CatalogSeedSource, useClass: StorefrontCatalogSeedSource },
    ProductEventWriter,
    ProductWrites,
    CatalogPurchasesConsumer,
    ...commandHandlers,
    ...queryHandlers,
  ],
})
export class AppModule {}
