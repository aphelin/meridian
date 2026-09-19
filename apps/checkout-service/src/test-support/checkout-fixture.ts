/* Wires the application layer by hand with in-memory fakes, the way Nest wires it with Prisma and HTTP adapters. */
import type { PlaceOrderRequest } from "@meridian/contracts";
import { FixedClock } from "@meridian/kernel";
import {
  AnonymiseCustomerHandler,
  CancelOrderHandler,
  ClearCartHandler,
  ConfirmOrderPaymentHandler,
  CreateCouponHandler,
  DecideReturnHandler,
  ExpireOrdersHandler,
  GenerateInvoiceHandler,
  MergeCartHandler,
  PlaceOrderHandler,
  PurgeIdleCartsHandler,
  RecordRefundOutcomeHandler,
  ReplaceCartItemsHandler,
  RequestRefundHandler,
  RequestReturnHandler,
  SeedCouponsHandler,
  TransitionOrderHandler,
  UpdateCouponHandler,
} from "../application/commands/handlers";
import {
  GetAdminOrderHandler,
  GetCartHandler,
  GetInvoiceLinkHandler,
  GetOrderHandler,
  ListAdminOrdersHandler,
  ListCouponsHandler,
  ListMyOrdersHandler,
  ListReturnsHandler,
  QuoteCheckoutHandler,
} from "../application/queries/handlers";
import { PlaceOrderSaga } from "../application/sagas/place-order.saga";
import { CartResolver, CheckoutPricing, LinePricer, OrderCancellation } from "../application/services";
import { Coupon, PricingCalculator, ShippingPolicies, TaxPolicy } from "../domain";
import {
  FakeAccessTokens,
  FakeCatalog,
  FakeInventory,
  FakeInvoiceRenderer,
  FakeInvoiceStorage,
  FakePaymentSummaries,
  FakePayments,
  FakeUnitOfWork,
  FixedSettings,
  InMemoryAuditLog,
  InMemoryCartRepository,
  InMemoryInvoiceRepository,
  InMemoryCouponRepository,
  InMemoryOrderReadModel,
  InMemoryOrderRepository,
  RecordingOutbox,
} from "./in-memory";

export const NOW = new Date("2026-09-17T10:00:00.000Z");

export function checkoutFixture() {
  const clock = new FixedClock(NOW);
  const carts = new InMemoryCartRepository();
  const orders = new InMemoryOrderRepository();
  const coupons = new InMemoryCouponRepository()
    .add(Coupon.create({ code: "NORTH-10", type: "percent", value: 10, minBasketCents: 0, maxRedemptions: null, oncePerCustomer: false, active: true, startsAt: null, expiresAt: null }))
    .add(Coupon.create({ code: "WELCOME-50", type: "fixed", value: 5000, minBasketCents: 50_000, maxRedemptions: null, oncePerCustomer: true, active: true, startsAt: null, expiresAt: null }));
  const uow = new FakeUnitOfWork();
  const outbox = new RecordingOutbox();
  const catalog = new FakeCatalog();
  const inventory = new FakeInventory();
  const payments = new FakePayments();
  const tokens = new FakeAccessTokens();
  const settings = new FixedSettings(15);
  const shipping = ShippingPolicies.standardSet();
  const calculator = new PricingCalculator(shipping, new TaxPolicy());
  const pricer = new LinePricer(catalog);
  const pricing = new CheckoutPricing(pricer, coupons, calculator);
  const resolver = new CartResolver(carts, clock);
  const cancellation = new OrderCancellation(orders, coupons, uow, outbox);
  const invoices = new InMemoryInvoiceRepository();
  const audit = new InMemoryAuditLog();
  const storage = new FakeInvoiceStorage();
  const renderer = new FakeInvoiceRenderer();
  const paymentSummaries = new FakePaymentSummaries();
  const readModel = new InMemoryOrderReadModel(orders);
  const saga = new PlaceOrderSaga(carts, orders, coupons, resolver, pricing, inventory, payments, cancellation, uow, outbox, tokens, settings, shipping, clock);

  return {
    clock,
    carts,
    orders,
    coupons,
    uow,
    outbox,
    catalog,
    inventory,
    payments,
    tokens,
    settings,
    shipping,
    saga,
    invoices,
    audit,
    storage,
    renderer,
    paymentSummaries,
    handlers: {
      replaceCart: new ReplaceCartItemsHandler(carts, resolver, pricer, clock),
      mergeCart: new MergeCartHandler(carts, resolver, uow, clock),
      clearCart: new ClearCartHandler(carts, resolver, clock),
      placeOrder: new PlaceOrderHandler(saga),
      confirmPayment: new ConfirmOrderPaymentHandler(orders, inventory, uow, outbox, clock),
      expireOrders: new ExpireOrdersHandler(orders, cancellation, settings, clock),
      anonymise: new AnonymiseCustomerHandler(orders, carts, uow, outbox),
      seedCoupons: new SeedCouponsHandler(coupons),
      purgeCarts: new PurgeIdleCartsHandler(carts, clock),
      getCart: new GetCartHandler(resolver),
      quote: new QuoteCheckoutHandler(pricing, resolver, clock),
      listMine: new ListMyOrdersHandler(readModel),
      getOrder: new GetOrderHandler(orders, tokens, shipping, clock),
      cancelOrder: new CancelOrderHandler(orders, coupons, audit, tokens, uow, outbox, shipping, clock),
      requestReturn: new RequestReturnHandler(orders, tokens, uow, outbox, clock),
      transition: new TransitionOrderHandler(orders, audit, uow, outbox, shipping, clock),
      requestRefund: new RequestRefundHandler(orders, audit, uow, outbox, clock),
      decideReturn: new DecideReturnHandler(orders, audit, uow, outbox, clock),
      recordRefund: new RecordRefundOutcomeHandler(orders, uow, outbox, clock),
      generateInvoice: new GenerateInvoiceHandler(orders, invoices, renderer, storage, uow, outbox, shipping, clock),
      createCoupon: new CreateCouponHandler(coupons, audit, uow, clock),
      updateCoupon: new UpdateCouponHandler(coupons, audit, uow, clock),
      invoiceLink: new GetInvoiceLinkHandler(orders, invoices, storage, tokens, settings),
      listAdminOrders: new ListAdminOrdersHandler(readModel),
      adminOrder: new GetAdminOrderHandler(orders, paymentSummaries, audit, shipping, clock),
      listReturns: new ListReturnsHandler(readModel),
      listCoupons: new ListCouponsHandler(coupons),
    },
  };
}

export type CheckoutFixture = ReturnType<typeof checkoutFixture>;

export const berlin = { fullName: "Guest Buyer", line1: "1 Probe Road", line2: null, city: "Berlin", postalCode: "10115", country: "DE", phone: "+49 30 1234" };

export function orderRequest(overrides: Partial<PlaceOrderRequest> = {}): PlaceOrderRequest {
  return { customer: { email: "Guest@Example.test", name: "Guest Buyer" }, shippingAddress: berlin, shippingMethod: "standard", couponCode: null, ...overrides };
}
