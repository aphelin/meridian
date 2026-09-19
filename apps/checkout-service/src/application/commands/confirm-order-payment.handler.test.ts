import { beforeEach, describe, expect, it } from "vitest";
import { type CheckoutFixture, checkoutFixture, orderRequest } from "../../test-support/checkout-fixture";
import { CancelOrderCommand } from "./cancel-order.command";
import { ConfirmOrderPaymentCommand } from "./confirm-order-payment.command";
import { PlaceOrderCommand } from "./place-order.command";

let f: CheckoutFixture;
let orderId: string;
let totalCents: number;

beforeEach(async () => {
  f = checkoutFixture();
  const cart = await f.handlers.replaceCart.execute({ userId: null, cartId: null, lines: [{ sku: "KITE-OCH", variantId: "ochre", qty: 1 }] } as never);
  const result = await f.handlers.placeOrder.execute(new PlaceOrderCommand(orderRequest(), null, cart.id, "corr"));
  orderId = result.order.id;
  totalCents = result.order.pricing.totalCents;
  f.outbox.rows.length = 0;
});

const confirm = (messageId: string, overrides = {}) =>
  f.handlers.confirmPayment.execute(new ConfirmOrderPaymentCommand(messageId, { orderId, paymentId: `pay_${orderId}`, transactionId: `txn_${orderId}`, amountCents: totalCents, ...overrides }));

describe("ConfirmOrderPayment", () => {
  it("confirm payment marks the order paid, emits OrderPaid and generate-invoice, then commits stock", async () => {
    expect(await confirm("m1")).toBe("paid");
    expect(f.orders.get(orderId).status).toBe("paid");
    expect(f.outbox.rows.map((row) => row.name)).toEqual(["OrderPaid", "checkout.generate-invoice"]);
    expect(f.inventory.committed).toEqual([orderId]);
  });

  it("confirm payment is idempotent for a redelivered message and a duplicate with a new message id", async () => {
    await confirm("m1");
    expect(await confirm("m1")).toBe("duplicate");
    expect(await confirm("m2")).toBe("already-paid");
    expect(f.outbox.named("OrderPaid")).toHaveLength(1);
    expect(f.outbox.named("payment.void")).toHaveLength(0);
  });

  it("confirm payment retries a failed stock commit without paying twice", async () => {
    f.inventory.commitFailures = 1;
    await expect(confirm("m1")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(f.orders.get(orderId).status).toBe("paid");
    expect(await confirm("m1")).toBe("already-paid");
    expect(f.inventory.committed).toEqual([orderId]);
    expect(f.outbox.named("OrderPaid")).toHaveLength(1);
  });

  it("confirm payment for an expired order voids the payment once", async () => {
    f.clock.advance(16 * 60_000);
    expect(await f.handlers.expireOrders.execute({ olderThanSeconds: undefined } as never)).toEqual({ expired: 1 });
    f.outbox.rows.length = 0;
    expect(await confirm("late")).toBe("voided");
    expect(await confirm("late")).toBe("duplicate");
    expect(f.outbox.rows).toEqual([expect.objectContaining({ name: "payment.void", payload: { orderId, transactionId: `txn_${orderId}`, reason: "order-cancelled" } })]);
    expect(f.inventory.committed).toHaveLength(0);
  });

  it("confirm payment with a mismatching amount voids instead of paying", async () => {
    expect(await confirm("m1", { amountCents: 1 })).toBe("voided");
    expect(f.orders.get(orderId).status).toBe("placed");
  });

  it("confirm payment reloads and retries after losing a concurrency race", async () => {
    f.orders.conflictOnce.add(orderId);
    expect(await confirm("m1")).toBe("paid");
    expect(f.outbox.named("OrderPaid")).toHaveLength(1);
  });

  it("confirm payment redelivered after the paid order was cancelled still commits the stock its restock relies on", async () => {
    f.inventory.commitFailures = 1;
    await expect(confirm("m1")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    await f.handlers.cancelOrder.execute(new CancelOrderCommand(orderId, { userId: "admin-1", role: "admin" }, null));
    expect(f.outbox.named("inventory.restock")).toHaveLength(1);
    expect(await confirm("m1")).toBe("already-paid");
    expect(f.inventory.committed).toEqual([orderId]);
  });

  it("confirm payment for an unknown order is NOT_FOUND", async () => {
    await expect(confirm("m1", { orderId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
