import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { catalog, checkout, newCorrelationId } from "../support/http";
import { type KafkaTap, kafkaTap } from "../support/kafka";
import { mailsTo, waitForMail } from "../support/mailhog";
import {
  adminLogin, adminStock, analyticsOverview, createProduct, deliver, pay, paymentSummary, placeOrder, rankingPriceCents, registerUser, searchHit, setCart, topProducts, waitForDelivery, waitForOrderStatus,
} from "../support/shop";
import { waitFor } from "../support/wait";

describe("purchase", () => {
  let tap: KafkaTap;
  beforeAll(async () => {
    tap = await kafkaTap(["meridian.checkout", "meridian.inventory"]);
  });
  afterAll(async () => {
    await tap?.stop();
  });

  test("full purchase end to end: register, verify, coupon quote, place, sandbox pay, OrderPaid, stock committed, invoice issued and downloadable, emails, fulfil/ship/deliver, review after delivery, analytics and search", async () => {
    // Two units of a fresh, expensive product: the order depletes its stock and dominates top products by revenue.
    const price = rankingPriceCents();
    const product = await createProduct({ priceCents: price, onHand: 2 });
    const [variant] = product.variants;
    await waitFor(async () => (await searchHit(product.name, product.slug))?.inStock === true, "fresh product indexed as in stock", { timeoutMs: 60_000 });
    const before = await analyticsOverview();

    // register → verify through the email Mailhog received
    const user = await registerUser("buyer");
    const shopper = { token: user.accessToken, email: user.email, name: user.name };

    // quote the server cart with a coupon
    await setCart(user.accessToken, [{ sku: variant.sku, variantId: variant.variantId, qty: 2 }]);
    const quote = await checkout().post("/checkout/quote", { shippingMethod: "standard", country: "DE", couponCode: "NORTH-10" }, { token: user.accessToken });
    expect(quote.status, quote.text).toBeLessThan(300);
    const subtotal = price * 2;
    const discount = Math.round(subtotal / 10);
    const total = subtotal - discount; // free standard shipping above €1000 after discount
    expect(quote.json.coupon).toMatchObject({ code: "NORTH-10", applied: true, discountCents: discount });
    expect(quote.json.pricing).toMatchObject({ subtotalCents: subtotal, discountCents: discount, shippingCents: 0, totalCents: total, taxRatePercent: 19, taxCents: Math.round((total * 19) / 119) });

    // reviews are refused before delivery
    const early = await catalog().post(`/products/${product.slug}/reviews`, { rating: 5, title: "Too early", body: "Trying to review before the delivery happened." }, { token: user.accessToken });
    expect(early.status, early.text).toBe(403);
    expect(early.json.code).toBe("REVIEW_NOT_ALLOWED");

    // place: reserve stock, create the payment intent
    const placed = await placeOrder(shopper, [{ sku: variant.sku, variantId: variant.variantId, qty: 2 }], { couponCode: "NORTH-10" });
    const orderId = placed.order.id;
    expect(placed.order).toMatchObject({ status: "placed", couponCode: "NORTH-10", correlationId: placed.correlationId });
    expect(placed.order.customer).toMatchObject({ userId: user.id, email: user.email });
    expect(placed.order.pricing.totalCents).toBe(total);
    expect(placed.payment).toMatchObject({ provider: "local-sandbox", status: "pending" });
    expect(placed.accessToken).toBeNull();
    expect(await adminStock(variant.sku)).toMatchObject({ onHand: 2, reserved: 2, available: 0 });
    await tap.find("StockReserved", (e) => e.payload.orderId === orderId, "reservation for the order");

    // sandbox payment → PaymentSucceeded → checkout.confirm-payment → OrderPaid
    const payCorrelation = newCorrelationId("pay");
    await pay(placed, payCorrelation);
    const orderPaid = await tap.find("OrderPaid", (e) => e.payload.orderId === orderId, "order paid");
    expect(orderPaid.envelope!.correlationId).toBe(payCorrelation);
    expect(orderPaid.envelope!.payload.pricing.totalCents).toBe(total);
    await waitForOrderStatus(orderId, "paid");
    expect(await paymentSummary(orderId)).toMatchObject({ status: "succeeded", amountCents: total, refundedCents: 0 });

    // stock committed: on-hand and reservation both drop, StockCommitted on the inventory log
    await tap.find("StockCommitted", (e) => e.payload.orderId === orderId, "stock committed for the order");
    await waitFor(async () => {
      const s = await adminStock(variant.sku);
      return s.onHand === 0 && s.reserved === 0 && s.available === 0;
    }, "committed stock (onHand 0, reserved 0)");

    // invoice issued asynchronously and downloadable through a presigned link
    const issued = await tap.find("InvoiceIssued", (e) => e.payload.orderId === orderId, "invoice issued", 90_000);
    expect(issued.envelope!.payload.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    const link = await waitFor(async () => {
      const r = await checkout().get(`/orders/${orderId}/invoice`, { token: user.accessToken });
      return r.status === 200 ? r.json : null;
    }, "invoice link for the owner");
    const pdf = await fetch(link.url, { signal: AbortSignal.timeout(15_000) });
    const bytes = Buffer.from(await pdf.arrayBuffer());
    expect(pdf.status).toBe(200);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const ownerView = await checkout().get(`/orders/${orderId}`, { token: user.accessToken });
    expect(ownerView.json.invoice?.number).toBe(issued.envelope!.payload.invoiceNumber);

    // confirmation + invoice emails; the EmailDelivery row carries the payment request's correlation id
    const number = placed.order.number as string;
    await waitForMail(user.email, (m) => m.subject.includes(`Order ${number} confirmed`), "order confirmation");
    await waitForMail(user.email, (m) => m.subject.includes(issued.envelope!.payload.invoiceNumber), "invoice email");
    const confirmation = await waitForDelivery(user.email, "order-confirmation");
    expect(confirmation.correlationId).toBe(payCorrelation);

    // admin (real login) fulfils, ships and delivers; shopper gets shipped and delivered emails
    const adminToken = await adminLogin();
    const { trackingNumber } = await deliver(orderId, adminToken);
    await tap.find("OrderDelivered", (e) => e.payload.orderId === orderId, "order delivered");
    const shippedMail = await waitForMail(user.email, (m) => m.subject.includes(`Order ${number} is on its way`), "shipped email");
    expect(shippedMail.body).toContain(trackingNumber);
    const deliveredMail = await waitForMail(user.email, (m) => m.subject.includes(`Order ${number} was delivered`), "delivered email");
    expect(deliveredMail.body).toContain(`/product/${product.slug}`); // review invitation
    const delivered = await waitForOrderStatus(orderId, "delivered");
    expect(delivered.fulfillment).toMatchObject({ carrier: "DHL", trackingNumber });
    expect(["placed", "paid", "fulfilling", "shipped", "delivered"].every((s) => delivered.timeline.some((t: { status: string }) => t.status === s))).toBe(true);

    // review allowed only now (catalog-purchases consumed OrderDelivered), once
    await waitFor(async () => (await catalog().get(`/products/${product.slug}/reviews/eligibility`, { token: user.accessToken })).json?.eligible === true, "review eligibility after delivery", { timeoutMs: 60_000 });
    const review = await catalog().post(`/products/${product.slug}/reviews`, { rating: 5, title: "Worth the wait", body: "Solid oak, sturdy and delivered on time." }, { token: user.accessToken });
    expect(review.status, review.text).toBe(201);
    expect(review.json.verifiedPurchase).toBe(true);
    const second = await catalog().post(`/products/${product.slug}/reviews`, { rating: 1, title: "Again", body: "A second review must be refused by catalog." }, { token: user.accessToken });
    expect(second.status).toBe(403);

    // analytics projections: paid totals grew by this order, top products list this slug with its line totals
    await waitFor(async () => (await topProducts()).find((p) => p.slug === product.slug && p.units === 2 && p.revenueCents === subtotal), "top products to include the order lines", { timeoutMs: 60_000 });
    const after = await analyticsOverview();
    expect(after.totals.ordersPaid).toBeGreaterThanOrEqual(before.totals.ordersPaid + 1);
    expect(after.totals.ordersPlaced).toBeGreaterThanOrEqual(before.totals.ordersPlaced + 1);
    expect(after.totals.grossCents).toBeGreaterThanOrEqual(before.totals.grossCents + total);

    // search read model reflects the sold-out stock
    await waitFor(async () => (await searchHit(product.name, product.slug))?.inStock === false, "search to show the product out of stock", { timeoutMs: 60_000 });

    // exactly one confirmation email despite the multi-hop flow
    expect((await mailsTo(user.email)).filter((m) => m.subject.includes(`Order ${number} confirmed`))).toHaveLength(1);
    expect(tap.count((r) => r.envelope?.name === "OrderPaid" && r.envelope.payload.orderId === orderId)).toBe(1);
  });
});
