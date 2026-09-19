import { CLOCK, SystemClock } from "@meridian/kernel";
import { IDEMPOTENCY_STORE, IdempotencyInterceptor, KitModule, MessagingModule } from "@meridian/nest-kit";
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { COMMAND_HANDLERS } from "./application/commands";
import { IdentityEventsConsumer, InvoiceGenerationConsumer, PaymentConfirmationConsumer, RefundOutcomeConsumer } from "./application/event-handlers";
import {
  CatalogPricing,
  CheckoutSettings,
  InventoryReservations,
  InvoiceRenderer,
  InvoiceStorage,
  MessageOutbox,
  OrderAccessTokens,
  OrderReadModel,
  PaymentIntents,
  PaymentSummaries,
  UnitOfWork,
} from "./application/ports";
import { QUERY_HANDLERS } from "./application/queries";
import { PlaceOrderSaga } from "./application/sagas/place-order.saga";
import { CartResolver, CheckoutPricing, LinePricer, OrderCancellation } from "./application/services";
import { AuditLog, CartRepository, CouponRepository, InvoiceRepository, OrderRepository, PricingCalculator, ShippingPolicies, TaxPolicy } from "./domain";
import { EnvCheckoutSettings } from "./infrastructure/config/env-checkout-settings";
import { HttpCatalogPricing } from "./infrastructure/http/http-catalog-pricing";
import { HttpInventoryReservations } from "./infrastructure/http/http-inventory-reservations";
import { PdfKitInvoiceRenderer } from "./infrastructure/documents/pdfkit-invoice-renderer";
import { HttpPaymentIntents } from "./infrastructure/http/http-payment-intents";
import { HttpPaymentSummaries } from "./infrastructure/http/http-payment-summaries";
import { UpstreamClients } from "./infrastructure/http/upstream-clients";
import { PrismaAuditLog } from "./infrastructure/persistence/prisma-audit-log";
import { PrismaCartRepository } from "./infrastructure/persistence/prisma-cart.repository";
import { PrismaCouponRepository } from "./infrastructure/persistence/prisma-coupon.repository";
import { PrismaInvoiceRepository } from "./infrastructure/persistence/prisma-invoice.repository";
import { PrismaIdempotencyStore } from "./infrastructure/persistence/prisma-idempotency.store";
import { PrismaMessageOutbox } from "./infrastructure/persistence/prisma-message-outbox";
import { PrismaOrderReadModel } from "./infrastructure/persistence/prisma-order.read-model";
import { PrismaOrderRepository } from "./infrastructure/persistence/prisma-order.repository";
import { PrismaUnitOfWork } from "./infrastructure/persistence/prisma-unit-of-work";
import { PrismaService } from "./infrastructure/persistence/prisma.service";
import { CheckoutSchedulers } from "./infrastructure/scheduling/checkout-schedulers";
import { KitOrderAccessTokens } from "./infrastructure/security/kit-order-access-tokens";
import { S3InvoiceStorage } from "./infrastructure/storage/s3-invoice-storage";
import { AdminCouponsController } from "./presentation/http/admin-coupons.controller";
import { AdminOrdersController } from "./presentation/http/admin-orders.controller";
import { CartController } from "./presentation/http/cart.controller";
import { AdminReturnsController } from "./presentation/http/admin-returns.controller";
import { CheckoutController } from "./presentation/http/checkout.controller";
import { OrderOperationsController } from "./presentation/http/order-operations.controller";
import { SeedController } from "./presentation/http/seed.controller";

export const SERVICE_NAME = "checkout-service";

@Module({
  imports: [
    CqrsModule.forRoot(),
    KitModule.forRoot({ service: SERVICE_NAME }),
    MessagingModule.forRoot({ service: SERVICE_NAME, prisma: PrismaService, kafka: true, rabbit: true, relay: true }),
  ],
  controllers: [CartController, CheckoutController, OrderOperationsController, AdminOrdersController, AdminReturnsController, AdminCouponsController, SeedController],
  providers: [
    PrismaService,
    { provide: CLOCK, useClass: SystemClock },

    // domain policies
    { provide: ShippingPolicies, useFactory: () => ShippingPolicies.standardSet() },
    { provide: TaxPolicy, useFactory: () => new TaxPolicy() },
    { provide: PricingCalculator, useFactory: (shipping: ShippingPolicies, tax: TaxPolicy) => new PricingCalculator(shipping, tax), inject: [ShippingPolicies, TaxPolicy] },

    // persistence
    { provide: CartRepository, useClass: PrismaCartRepository },
    { provide: CouponRepository, useClass: PrismaCouponRepository },
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    { provide: OrderReadModel, useClass: PrismaOrderReadModel },
    { provide: InvoiceRepository, useClass: PrismaInvoiceRepository },
    { provide: AuditLog, useClass: PrismaAuditLog },
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
    { provide: MessageOutbox, useClass: PrismaMessageOutbox },
    PrismaIdempotencyStore,
    { provide: IDEMPOTENCY_STORE, useExisting: PrismaIdempotencyStore },
    IdempotencyInterceptor,

    // adapters
    UpstreamClients,
    { provide: CatalogPricing, useClass: HttpCatalogPricing },
    { provide: InventoryReservations, useClass: HttpInventoryReservations },
    { provide: PaymentIntents, useClass: HttpPaymentIntents },
    { provide: PaymentSummaries, useClass: HttpPaymentSummaries },
    { provide: InvoiceStorage, useClass: S3InvoiceStorage },
    { provide: InvoiceRenderer, useClass: PdfKitInvoiceRenderer },
    { provide: OrderAccessTokens, useClass: KitOrderAccessTokens },
    { provide: CheckoutSettings, useClass: EnvCheckoutSettings },

    // application
    LinePricer,
    CheckoutPricing,
    CartResolver,
    OrderCancellation,
    PlaceOrderSaga,
    ...COMMAND_HANDLERS,
    ...QUERY_HANDLERS,
    PaymentConfirmationConsumer,
    RefundOutcomeConsumer,
    InvoiceGenerationConsumer,
    IdentityEventsConsumer,
    CheckoutSchedulers,
  ],
})
export class AppModule {}
