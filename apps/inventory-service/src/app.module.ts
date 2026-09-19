import { CLOCK, SystemClock } from "@meridian/kernel";
import { jwtModule, KitModule, MessagingModule } from "@meridian/nest-kit";
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { CommandHandlers } from "./application/commands";
import { CatalogSyncConsumer, InventoryCommandConsumers } from "./application/event-handlers";
import { INVENTORY_SETTINGS, InventoryReadModel, UnitOfWork } from "./application/ports";
import { QueryHandlers } from "./application/queries";
import { loadInventorySettings } from "./infrastructure/config/inventory-settings";
import { ReservationExpiryJob } from "./infrastructure/jobs/reservation-expiry.job";
import { PrismaInventoryReadModel } from "./infrastructure/persistence/prisma-inventory-read-model";
import { PrismaUnitOfWork } from "./infrastructure/persistence/prisma-unit-of-work";
import { PrismaService } from "./infrastructure/prisma.service";
import { AdminStockController } from "./presentation/http/admin-stock.controller";
import { ReservationsController } from "./presentation/http/reservations.controller";
import { SeedController } from "./presentation/http/seed.controller";
import { StockController } from "./presentation/http/stock.controller";

export const SERVICE_NAME = "inventory-service";

@Module({
  imports: [
    CqrsModule.forRoot(),
    jwtModule(),
    KitModule.forRoot({ service: SERVICE_NAME }),
    MessagingModule.forRoot({ service: SERVICE_NAME, prisma: PrismaService, kafka: true, rabbit: true, relay: true }),
  ],
  controllers: [StockController, ReservationsController, AdminStockController, SeedController],
  providers: [
    PrismaService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: INVENTORY_SETTINGS, useFactory: () => loadInventorySettings() },
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
    { provide: InventoryReadModel, useClass: PrismaInventoryReadModel },
    ...CommandHandlers,
    ...QueryHandlers,
    InventoryCommandConsumers,
    CatalogSyncConsumer,
    ReservationExpiryJob,
  ],
  exports: [PrismaService],
})
export class AppModule {}
