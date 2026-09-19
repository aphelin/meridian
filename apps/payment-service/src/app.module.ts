import { CLOCK, SystemClock } from "@meridian/kernel";
import { jwtModule, KitModule, MessagingModule } from "@meridian/nest-kit";
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { CommandHandlers } from "./application/commands";
import { PaymentCommandConsumers } from "./application/event-handlers";
import { ClientSecrets, PAYMENT_SETTINGS, PaymentProviders, PaymentReadModel, StripeWebhookVerifier, UnitOfWork, WebhookVerifier } from "./application/ports";
import { QueryHandlers } from "./application/queries";
import { RefundDispatcher } from "./application/services/refund-dispatcher";
import { loadPaymentConfig, PAYMENT_CONFIG, type PaymentConfig } from "./infrastructure/config/payment-settings";
import { PrismaPaymentReadModel } from "./infrastructure/persistence/prisma-payment-read-model";
import { PrismaUnitOfWork } from "./infrastructure/persistence/prisma-unit-of-work";
import { PrismaService } from "./infrastructure/prisma.service";
import { HmacClientSecrets } from "./infrastructure/providers/hmac-client-secrets";
import { PaddleWebhookVerifier } from "./infrastructure/providers/paddle-webhook-verifier";
import { PaymentProviderRegistry } from "./infrastructure/providers/payment-provider-registry";
import { StripeSignatureVerifier } from "./infrastructure/providers/stripe-webhook-verifier";
import { IntentsController } from "./presentation/http/intents.controller";
import { PaddleWebhookController } from "./presentation/http/paddle-webhook.controller";
import { PaymentsController } from "./presentation/http/payments.controller";
import { StripeWebhookController } from "./presentation/http/stripe-webhook.controller";

export const SERVICE_NAME = "payment-service";

@Module({
  imports: [
    CqrsModule.forRoot(),
    jwtModule(),
    KitModule.forRoot({ service: SERVICE_NAME }),
    MessagingModule.forRoot({ service: SERVICE_NAME, prisma: PrismaService, kafka: true, rabbit: true, relay: true }),
  ],
  controllers: [IntentsController, PaymentsController, PaddleWebhookController, StripeWebhookController],
  providers: [
    PrismaService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: PAYMENT_CONFIG, useFactory: () => loadPaymentConfig() },
    { provide: PAYMENT_SETTINGS, useFactory: (config: PaymentConfig) => ({ refundDispatchLeaseMs: config.refundDispatchLeaseMs }), inject: [PAYMENT_CONFIG] },
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
    { provide: PaymentReadModel, useClass: PrismaPaymentReadModel },
    { provide: PaymentProviders, useClass: PaymentProviderRegistry },
    { provide: ClientSecrets, useFactory: () => new HmacClientSecrets() },
    { provide: WebhookVerifier, useClass: PaddleWebhookVerifier },
    { provide: StripeWebhookVerifier, useClass: StripeSignatureVerifier },
    RefundDispatcher,
    ...CommandHandlers,
    ...QueryHandlers,
    PaymentCommandConsumers,
  ],
  exports: [PrismaService],
})
export class AppModule {}
