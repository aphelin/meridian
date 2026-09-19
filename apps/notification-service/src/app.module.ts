import { CLOCK, SystemClock } from "@meridian/kernel";
import { jwtModule, KitModule, MessagingModule } from "@meridian/nest-kit";
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { CommandHandlers } from "./application/commands";
import { NotificationDispatcherConsumer, SendEmailConsumer } from "./application/event-handlers";
import { EmailRenderer, IdGenerator, Mailer, NOTIFICATION_SETTINGS, NotificationReadModel, SiteLinks, UnitOfWork } from "./application/ports";
import { QueryHandlers } from "./application/queries";
import { loadNotificationSettings } from "./infrastructure/config/notification-settings";
import { StorefrontLinks } from "./infrastructure/links/site-links";
import { SmtpMailer } from "./infrastructure/mail/smtp-mailer";
import { PrismaNotificationReadModel } from "./infrastructure/persistence/prisma-notification-read-model";
import { PrismaUnitOfWork } from "./infrastructure/persistence/prisma-unit-of-work";
import { RandomIdGenerator } from "./infrastructure/persistence/random-id-generator";
import { PrismaService } from "./infrastructure/prisma.service";
import { TemplateEmailRenderer } from "./infrastructure/templates/template-renderer";
import { AdminNotificationsController } from "./presentation/http/admin-notifications.controller";
import { EngagementController } from "./presentation/http/engagement.controller";

export const SERVICE_NAME = "notification-service";

@Module({
  imports: [
    CqrsModule.forRoot(),
    jwtModule(),
    KitModule.forRoot({ service: SERVICE_NAME }),
    MessagingModule.forRoot({ service: SERVICE_NAME, prisma: PrismaService, kafka: true, rabbit: true, relay: true }),
  ],
  controllers: [EngagementController, AdminNotificationsController],
  providers: [
    PrismaService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: NOTIFICATION_SETTINGS, useFactory: () => loadNotificationSettings() },
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
    { provide: NotificationReadModel, useClass: PrismaNotificationReadModel },
    { provide: Mailer, useClass: SmtpMailer },
    { provide: EmailRenderer, useClass: TemplateEmailRenderer },
    { provide: SiteLinks, useClass: StorefrontLinks },
    { provide: IdGenerator, useClass: RandomIdGenerator },
    ...CommandHandlers,
    ...QueryHandlers,
    SendEmailConsumer,
    NotificationDispatcherConsumer,
  ],
  exports: [PrismaService],
})
export class AppModule {}
