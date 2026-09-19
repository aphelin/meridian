import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { checkout, newCorrelationId, payment } from "../support/http";
import { type KafkaTap, kafkaTap } from "../support/kafka";
import { orderAccessToken, tokens } from "../support/auth";
import { CAPTCHA_TOKEN } from "../support/env";
import { waitForMail } from "../support/mailhog";
import { address, adminStock, analyticsOverview, createProduct, pay, uniqueEmail, waitForOrderStatus } from "../support/shop";
import { holdsFor, waitFor } from "../support/wait";

describe("saga compensation", () => {
  let tap: KafkaTap;
  beforeAll(async () => {
    tap = await kafkaTap(["meridian.checkout", "meridian.inventory"]);
  });
  afterAll(async () => {
    await tap?.stop();
  });

  test("out of stock at placement compensates: all-or-nothing reservation, order cancelled (out-of-stock), no payment intent, cart kept; the corrected guest order pays with its access link", async () => {
    // two lines; the second cannot be reserved, so the first must not stay held either
    const plenty = await createProduct({ priceCents: 30_000, onHand: 5 });
    const scarce = await createProduct({ priceCents: 20_000, onHand: 1 });
    const email = uniqueEmail("oos");
    const cartLines = [
      { sku: plenty.variants[0].sku, variantId: plenty.variants[0].variantId, qty: 2 },
      { sku: scarce.variants[0].sku, variantId: scarce.variants[0].variantId, qty: 3 },
    ];
    const guestCart = await checkout().put("/cart/items", { lines: cartLines });
    expect(guestCart.status, guestCart.text).toBe(200);
    const cartId = guestCart.json.id as string;

    const outOfStockBefore = (await analyticsOverview()).cancellations.find((c: { reason: string; count: number }) => c.reason === "out-of-stock")?.count ?? 0;
    const correlationId = newCorrelationId("oos");
    const placed = await checkout().post(
      "/orders",
      { customer: { email, name: "Out Of Stock" }, shippingAddress: address, shippingMethod: "express", couponCode: null },
      { headers: { "x-cart-id": cartId, "idempotency-key": randomUUID(), "x-captcha-token": CAPTCHA_TOKEN }, correlationId },
    );
    expect(placed.status, placed.text).toBe(409);
    expect(placed.json).toMatchObject({ code: "OUT_OF_STOCK", correlationId });
    expect(placed.json.details).toMatchObject({ sku: scarce.variants[0].sku, available: 1 });

    // the saga placed the order, failed to reserve and compensated by cancelling it
    const cancelled = await tap.find("OrderCancelled", (e) => e.payload.customer.email === email, "compensating cancellation");
    expect(cancelled.envelope!.payload).toMatchObject({ reason: "out-of-stock", refundRequired: false });
    expect(cancelled.envelope!.correlationId).toBe(correlationId);
    const orderId = cancelled.envelope!.payload.orderId as string;
    const placedEvent = await tap.find("OrderPlaced", (e) => e.payload.orderId === orderId, "the placed order preceding compensation");
    expect(placedEvent.envelope!.correlationId).toBe(correlationId);

    const order = await checkout().get(`/admin/orders/${orderId}`, { token: tokens.admin() });
    expect(order.status, order.text).toBe(200);
    expect(order.json).toMatchObject({ status: "cancelled", cancellationReason: "out-of-stock" });

    // nothing reserved or held on either product, no reservation event, no payment intent
    expect(await adminStock(plenty.variants[0].sku)).toMatchObject({ onHand: 5, reserved: 0, available: 5 });
    expect(await adminStock(scarce.variants[0].sku)).toMatchObject({ onHand: 1, reserved: 0, available: 1 });
    const noPayment = await payment().get(`/payments/by-order/${orderId}`, { token: tokens.service() });
    expect(noPayment.status, noPayment.text).toBe(404);
    await holdsFor(async () => tap.count((r) => r.envelope?.name === "StockReserved" && r.envelope.payload.orderId === orderId) === 0, "no StockReserved for the failed order", { windowMs: 2000 });

    // the shopper keeps the cart to fix quantities
    const cart = await checkout().get("/cart", { headers: { "x-cart-id": cartId } });
    expect(cart.json.lines).toHaveLength(2);

    // after the fix the same cart places fine
    await checkout().put("/cart/items", { lines: [cartLines[0], { ...cartLines[1], qty: 1 }] }, { headers: { "x-cart-id": cartId } });
    const retry = await checkout().post(
      "/orders",
      { customer: { email, name: "Out Of Stock" }, shippingAddress: address, shippingMethod: "express", couponCode: null },
      { headers: { "x-cart-id": cartId, "idempotency-key": randomUUID(), "x-captcha-token": CAPTCHA_TOKEN } },
    );
    expect(retry.status, retry.text).toBe(201);
    await waitFor(async () => (await adminStock(scarce.variants[0].sku)).reserved === 1, "reservation of the corrected order");
    expect(retry.json.accessToken).toBe(orderAccessToken(retry.json.order.id));

    // the guest pays; order emails carry the guest access link and the guest can read the order and its invoice with it
    const guestOrderId = retry.json.order.id as string;
    await pay({ ...retry.json, correlationId: retry.correlationId });
    await waitForOrderStatus(guestOrderId, "paid");
    const confirmation = await waitForMail(email, (m) => m.subject.includes(`Order ${retry.json.order.number} confirmed`), "guest order confirmation");
    expect(confirmation.body).toContain(`access=${retry.json.accessToken}`);
    expect((await checkout().get(`/orders/${guestOrderId}`)).status).toBe(403);
    const link = await waitFor(async () => {
      const r = await checkout().get(`/orders/${guestOrderId}/invoice`, { headers: { "x-order-access": retry.json.accessToken } });
      return r.status === 200 ? r.json : null;
    }, "guest invoice link", { timeoutMs: 60_000 });
    expect((await fetch(link.url, { signal: AbortSignal.timeout(15_000) })).status).toBe(200);

    // analytics projected the compensating cancellation by reason
    await waitFor(async () => ((await analyticsOverview()).cancellations.find((c: { reason: string; count: number }) => c.reason === "out-of-stock")?.count ?? 0) >= outOfStockBefore + 1, "out-of-stock cancellation projected by analytics", { timeoutMs: 60_000 });
  });
});
