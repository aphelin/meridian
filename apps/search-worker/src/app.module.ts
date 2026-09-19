import { jwtModule, KitModule, MessagingModule } from "@meridian/nest-kit";
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { CommandHandlers } from "./application/commands";
import { SearchIndexerConsumer } from "./application/event-handlers";
import { IndexReplayer, SearchIndexMaintenance, SearchReadModel } from "./application/ports";
import { QueryHandlers } from "./application/queries";
import { SearchDocumentRepository, SkuAvailabilityRepository } from "./domain";
import { ReadModelBootstrapJob } from "./infrastructure/jobs/read-model-bootstrap.job";
import { KafkaIndexReplayer } from "./infrastructure/messaging/kafka-index-replayer";
import { PrismaSearchDocumentRepository } from "./infrastructure/persistence/prisma-search-document.repository";
import { PrismaSearchIndexMaintenance, PrismaSearchReadModel } from "./infrastructure/persistence/prisma-search-read-model";
import { PrismaSkuAvailabilityRepository } from "./infrastructure/persistence/prisma-sku-availability.repository";
import { PrismaService } from "./infrastructure/prisma.service";
import { AdminSearchController } from "./presentation/http/admin-search.controller";
import { SearchController } from "./presentation/http/search.controller";

export const SERVICE_NAME = "search-worker";

@Module({
  imports: [
    CqrsModule.forRoot(),
    jwtModule(),
    KitModule.forRoot({ service: SERVICE_NAME }),
    // Kafka only: the worker consumes domain events and publishes nothing (no outbox relay, no RabbitMQ commands).
    MessagingModule.forRoot({ service: SERVICE_NAME, prisma: PrismaService, kafka: true, rabbit: false, relay: false }),
  ],
  controllers: [SearchController, AdminSearchController],
  providers: [
    PrismaService,
    { provide: SearchDocumentRepository, useClass: PrismaSearchDocumentRepository },
    { provide: SkuAvailabilityRepository, useClass: PrismaSkuAvailabilityRepository },
    { provide: SearchReadModel, useClass: PrismaSearchReadModel },
    { provide: SearchIndexMaintenance, useClass: PrismaSearchIndexMaintenance },
    { provide: IndexReplayer, useClass: KafkaIndexReplayer },
    ...CommandHandlers,
    ...QueryHandlers,
    SearchIndexerConsumer,
    ReadModelBootstrapJob,
  ],
  exports: [PrismaService],
})
export class AppModule {}
