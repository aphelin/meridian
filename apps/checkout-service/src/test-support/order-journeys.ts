/* Drives orders through the real handlers (in-memory fakes) to the state a test needs. */
import type { CartLineInput } from "@meridian/contracts";
import { ConfirmOrderPaymentCommand } from "../application/commands/confirm-order-payment.command";
import { PlaceOrderCommand } from "../application/commands/place-order.command";
import { ReplaceCartItemsCommand } from "../application/commands/replace-cart-items.command";
import { TransitionOrderCommand } from "../application/commands/transition-order.command";
import type { CheckoutFixture } from "./checkout-fixture";
import { orderRequest } from "./checkout-fixture";

export const ADMIN = { userId: "admin-1", role: "admin" };
export const kite = (qty = 1): CartLineInput[] => [{ sku: "KITE-OCH", variantId: "ochre", qty }];
export const holtAndKites: CartLineInput[] = [
  { sku: "HOLT-CHA-3", variantId: "charcoal", qty: 1 },
  { sku: "KITE-OCH", variantId: "ochre", qty: 2 },
];

let messages = 0;

export async function placeOrder(f: CheckoutFixture, opts: { userId?: string | null; lines?: CartLineInput[]; couponCode?: string | null } = {}) {
  const userId = opts.userId ?? null;
  const cart = await f.handlers.replaceCart.execute(new ReplaceCartItemsCommand(userId, null, opts.lines ?? kite()));
  const result = await f.handlers.placeOrder.execute(new PlaceOrderCommand(orderRequest({ couponCode: opts.couponCode ?? null }), userId, userId ? null : cart.id, "corr"));
  return { ...result, orderId: result.order.id, accessToken: result.accessToken };
}

export async function payOrder(f: CheckoutFixture, orderId: string) {
  const order = f.orders.get(orderId);
  await f.handlers.confirmPayment.execute(
    new ConfirmOrderPaymentCommand(`confirm-${++messages}`, { orderId, paymentId: `pay_${orderId}`, transactionId: `txn_${orderId}`, amountCents: order.pricing.totalCents }),
  );
}

export async function deliverOrder(f: CheckoutFixture, orderId: string) {
  await f.handlers.transition.execute(new TransitionOrderCommand(orderId, ADMIN.userId, { status: "fulfilling" }));
  await f.handlers.transition.execute(new TransitionOrderCommand(orderId, ADMIN.userId, { status: "shipped", carrier: "DHL", trackingNumber: "JD0001" }));
  await f.handlers.transition.execute(new TransitionOrderCommand(orderId, ADMIN.userId, { status: "delivered" }));
}

/** A signed-in customer's order (NORTH-10, holt + two kites: total 313200) paid and delivered. */
export async function deliveredOrder(f: CheckoutFixture, userId = "user-1") {
  const placed = await placeOrder(f, { userId, lines: holtAndKites, couponCode: "NORTH-10" });
  await payOrder(f, placed.orderId);
  await deliverOrder(f, placed.orderId);
  f.outbox.rows.length = 0;
  f.audit.entries.length = 0;
  return placed;
}
