import { CLOCK, SystemClock } from "@meridian/kernel";
import { jwtModule, KitModule, MessagingModule } from "@meridian/nest-kit";
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { CommandHandlers } from "./application/commands";
import { AnalyticsProjectorConsumer } from "./application/event-handlers";
import { AnalyticsReadModel, ProjectionUnitOfWork, ProjectorControl } from "./application/ports";
import { QueryHandlers } from "./application/queries";
import { KafkaProjectorControl } from "./infrastructure/messaging/kafka-projector-control";
import { PrismaAnalyticsReadModel } from "./infrastructure/persistence/prisma-analytics-read-model";
import { PrismaProjectionUnitOfWork } from "./infrastructure/persistence/prisma-projection-unit-of-work";
import { PrismaService } from "./infrastructure/prisma.service";
import { AdminAnalyticsController } from "./presentation/http/admin-analytics.controller";
import { AnalyticsController } from "./presentation/http/analytics.controller";

export const SERVICE_NAME = "analytics-service";

@Module({
  imports: [
    CqrsModule.forRoot(),
    jwtModule(),
    KitModule.forRoot({ service: SERVICE_NAME }),
    // Pure read model: consumes the event log, publishes nothing (no relay, no RabbitMQ).
    MessagingModule.forRoot({ service: SERVICE_NAME, prisma: PrismaService, kafka: true, rabbit: false, relay: false }),
  ],
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [
    PrismaService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: ProjectionUnitOfWork, useClass: PrismaProjectionUnitOfWork },
    { provide: AnalyticsReadModel, useClass: PrismaAnalyticsReadModel },
    { provide: ProjectorControl, useClass: KafkaProjectorControl },
    ...CommandHandlers,
    ...QueryHandlers,
    AnalyticsProjectorConsumer,
  ],
})
export class AppModule {}
