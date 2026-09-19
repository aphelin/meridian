import type { CustomerRef, PaymentIntentDto, PlaceOrderResultDto } from "@meridian/contracts";
import { CLOCK, type Clock, DomainError, Email, ensure, Money } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { Inject, Injectable } from "@nestjs/common";
import {
  CartRepository,
  Coupon,
  CouponRepository,
  DuplicateOrderNumberError,
  newId,
  Order,
  OrderNumber,
  OrderRepository,
  ShippingPolicies,
} from "../../domain";
import type { PlaceOrderCommand } from "../commands/place-order.command";
import { toOrderDto } from "../mappers/order-dto.mapper";
import { CheckoutSettings, InventoryReservations, MessageOutbox, OrderAccessTokens, PaymentIntents, UnitOfWork } from "../ports";
import { CartResolver, type CheckoutQuote, CheckoutPricing, OrderCancellation, retryOnConflict } from "../services";

const log = createLogger("PlaceOrderSaga");
const NUMBER_ATTEMPTS = 5;

/**
 * Orchestrated saga for placing an order:
 *   1. price the cart via catalog (HTTP) into a domain quote (coupon specification enforced),
 *   2. Order.place + coupon redemption + outbox OrderPlaced/CouponRedeemed in one transaction,
 *   3. reserve every line in inventory (HTTP, all-or-nothing),
 *   4. create the payment intent (HTTP),
 *   5. attach the intent to the order and clear the cart.
 * Compensation: a failed reservation cancels the order (out-of-stock); a failed intent cancels the order and sends
 * `inventory.release-reservation`. Each compensation also gives the coupon redemption back. A crash between steps
 * leaves a `placed` order that the expiry sweep cancels and releases.
 */
@Injectable()
export class PlaceOrderSaga {
  constructor(
    private readonly carts: CartRepository,
    private readonly orders: OrderRepository,
    private readonly coupons: CouponRepository,
    private readonly resolver: CartResolver,
    private readonly pricing: CheckoutPricing,
    private readonly inventory: InventoryReservations,
    private readonly payments: PaymentIntents,
    private readonly cancellation: OrderCancellation,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
    private readonly tokens: OrderAccessTokens,
    private readonly settings: CheckoutSettings,
    private readonly shipping: ShippingPolicies,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async run(command: PlaceOrderCommand): Promise<PlaceOrderResultDto> {
    const { request, userId } = command;
    const now = this.clock.now();

    const cart = await this.resolver.existing(userId, command.cartId);
    ensure(cart && !cart.isEmpty, "VALIDATION_FAILED", "Your bag is empty.");
    const customer: CustomerRef = { userId, email: Email.parse(request.customer.email).value, name: request.customer.name.trim() };
    const customerKey = Coupon.customerKey(userId, customer.email)!;

    // 1. price
    const quote = await this.pricing.quote({
      lines: cart.lines.map(({ sku, variantId, qty }) => ({ sku, variantId, qty })),
      shippingMethod: request.shippingMethod,
      country: request.shippingAddress.country,
      couponCode: request.couponCode ?? null,
      customerKey,
      now,
    });
    if (quote.verdict && !quote.verdict.satisfied) throw new DomainError(quote.verdict.code, quote.verdict.message, { couponCode: quote.couponCode });

    // 2. place
    const order = await this.place(command, customer, customerKey, quote, now);
    log.info("order placed", { orderId: order.id, number: order.number, totalCents: order.totalCents });

    // 3. reserve
    try {
      await this.inventory.reserve(order.id, order.stockLines());
    } catch (error) {
      const outOfStock = error instanceof DomainError && error.code === "OUT_OF_STOCK";
      log.warn("reservation failed; compensating", { orderId: order.id, outOfStock, error: describe(error) });
      // A timeout may have left a hold behind, so only a definite out-of-stock answer skips the release.
      await this.compensate(order.id, "out-of-stock", outOfStock ? null : "cancelled");
      throw error;
    }

    // 4. payment intent
    let intent: PaymentIntentDto;
    try {
      intent = await this.payments.createIntent({
        orderId: order.id,
        orderNumber: order.number,
        amountCents: order.totalCents,
        currency: "EUR",
        customer: { email: customer.email, name: customer.name },
        lines: quote.basket.lines.map((line) => ({ name: `${line.productName} — ${line.variantLabel}`, qty: line.qty, unitPriceCents: line.unitPriceCents })),
      });
    } catch (error) {
      log.warn("payment intent failed; compensating", { orderId: order.id, error: describe(error) });
      await this.compensate(order.id, "payment-unavailable", "payment-failed");
      throw new DomainError("UPSTREAM_UNAVAILABLE", "Payments are temporarily unavailable, so your order was not placed. Please try again shortly.", { orderId: order.id });
    }

    // 5. attach intent, clear cart
    const placed = await this.complete(order.id, intent, cart.id);
    return {
      order: toOrderDto(placed, this.shipping, this.clock.now()),
      payment: intent,
      accessToken: userId ? null : this.tokens.issue(placed.id),
    };
  }

  private async place(command: PlaceOrderCommand, customer: CustomerRef, customerKey: string, quote: CheckoutQuote, now: Date): Promise<Order> {
    const { request } = command;
    for (let attempt = 1; ; attempt++) {
      const order = Order.place({
        id: newId(),
        number: OrderNumber.generate().value,
        customer,
        shippingAddress: { ...request.shippingAddress, country: request.shippingAddress.country.toUpperCase() },
        shippingMethod: request.shippingMethod,
        lines: quote.basket.lines,
        pricing: quote.basket.pricing,
        couponCode: quote.coupon && quote.verdict?.satisfied ? quote.coupon.code : null,
        correlationId: command.correlationId,
        holdMinutes: this.settings.orderHoldMinutes,
        now,
      });
      try {
        await this.uow.run(async (tx) => {
          await this.orders.save(order, tx);
          const events = order.pullEvents();
          if (quote.coupon && quote.verdict?.satisfied) {
            // Reloaded inside the transaction so a retried attempt never redeems a stale in-memory copy twice.
            const coupon = (await this.coupons.findByCode(quote.coupon.code, tx)) ?? quote.coupon;
            const subtotal = Money.sum(quote.pricedLines.map((line) => line.lineTotal));
            const redemption = coupon.redeem(order.id, { subtotal, now, customerKey, alreadyUsedByCustomer: quote.alreadyUsedByCustomer });
            await this.coupons.recordRedemption(coupon, redemption, tx);
            events.push(...coupon.pullEvents());
          }
          await this.outbox.events(tx, events);
        });
        return order;
      } catch (error) {
        if (error instanceof DuplicateOrderNumberError && attempt < NUMBER_ATTEMPTS) continue;
        throw error;
      }
    }
  }

  private async compensate(orderId: string, reason: "out-of-stock" | "payment-unavailable", release: "cancelled" | "payment-failed" | null): Promise<void> {
    try {
      await this.cancellation.cancelUnpaid(orderId, reason, release, this.clock.now());
    } catch (error) {
      // The order stays `placed`; the expiry sweep cancels it and releases its stock later.
      log.error("compensation failed; expiry sweep will clean up", { orderId, reason, error: describe(error) });
    }
  }

  private complete(orderId: string, intent: PaymentIntentDto, cartId: string): Promise<Order> {
    return retryOnConflict(() =>
      this.uow.run(async (tx) => {
        const order = await this.orders.findById(orderId, tx);
        if (!order) throw new DomainError("NOT_FOUND", "Order not found.");
        order.attachPaymentIntent(intent.paymentId, intent.transactionId);
        await this.orders.save(order, tx);
        const cart = await this.carts.findById(cartId, tx);
        if (cart && !cart.isEmpty) {
          cart.clear(this.clock.now());
          await this.carts.save(cart, tx);
        }
        return order;
      }),
    );
  }
}

function describe(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
