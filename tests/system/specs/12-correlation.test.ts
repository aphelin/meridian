import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { CAPTCHA_TOKEN, stackLogPath } from "../support/env";
import { identity, newCorrelationId } from "../support/http";
import { type KafkaTap, kafkaTap } from "../support/kafka";
import { waitForMail } from "../support/mailhog";
import { createProduct, pay, placeOrder, registerUser, uid, uniqueEmail, waitForDelivery, waitForOrderStatus } from "../support/shop";
import { waitFor } from "../support/wait";

describe("correlation ids", () => {
  let tap: KafkaTap;
  beforeAll(async () => {
    tap = await kafkaTap(["meridian.identity", "meridian.checkout", "meridian.inventory", "meridian.payment", "meridian.notification"]);
  });
  afterAll(async () => {
    await tap?.stop();
  });

  test("correlation id from one HTTP request is echoed and found on outbox-produced Kafka events (envelope and header), the Rabbit command it caused, consumer logs and the EmailDelivery row", async () => {
    // identity: register → UserRegistered (Kafka) + notification.send-email (Rabbit) → EmailDelivery + EmailSent
    const email = uniqueEmail("corr");
    const registerCorrelation = newCorrelationId("corr-register");
    const reg = await identity().post("/auth/register", { email, password: `pw-${uid(8)}`, name: "Correlated" }, { headers: { "x-captcha-token": CAPTCHA_TOKEN }, correlationId: registerCorrelation });
    expect(reg.status, reg.text).toBe(201);
    expect(reg.echoedCorrelationId).toBe(registerCorrelation);
    const registered = await tap.find("UserRegistered", (e) => e.payload.email === email, "UserRegistered");
    expect(registered.envelope!.correlationId).toBe(registerCorrelation);
    expect(registered.headers["x-correlation-id"]).toBe(registerCorrelation);
    expect(registered.envelope!.producer).toBe("identity-service");
    const verifyDelivery = await waitForDelivery(email, "verify-email");
    expect(verifyDelivery.correlationId).toBe(registerCorrelation);
    const sent = await tap.find("EmailSent", (e) => e.payload.to === email && e.payload.template === "verify-email", "EmailSent for the verification email");
    expect(sent.envelope!.correlationId).toBe(registerCorrelation);
    expect(sent.envelope!.producer).toBe("notification-service");
    await waitForMail(email, (m) => /verify-email\?token=/.test(m.body), "verification email");

    // checkout → inventory → payment: one place-order request correlates the whole saga
    const product = await createProduct({ priceCents: 12_000, onHand: 3 });
    const [v] = product.variants;
    const user = await registerUser("corr-buyer", { verify: false });
    const orderCorrelation = newCorrelationId("corr-order");
    const placed = await placeOrder({ token: user.accessToken, email: user.email, name: user.name }, [{ sku: v.sku, variantId: v.variantId, qty: 1 }], { correlationId: orderCorrelation });
    expect(placed.order.correlationId).toBe(orderCorrelation);
    const orderId = placed.order.id as string;
    for (const name of ["OrderPlaced", "StockReserved"]) {
      const rec = await tap.find(name, (e) => e.payload.orderId === orderId, `${name} for the order`);
      expect(rec.envelope!.correlationId, name).toBe(orderCorrelation);
      expect(rec.headers["x-correlation-id"], name).toBe(orderCorrelation);
    }

    // payment completion request: PaymentSucceeded → checkout.confirm-payment (Rabbit) → OrderPaid + StockCommitted → order-confirmation delivery
    const payCorrelation = newCorrelationId("corr-pay");
    const paid = await pay(placed, payCorrelation);
    expect(paid.echoedCorrelationId).toBe(payCorrelation);
    await waitForOrderStatus(orderId, "paid");
    const succeeded = await tap.find("PaymentSucceeded", (e) => e.payload.orderId === orderId, "PaymentSucceeded");
    expect(succeeded.envelope!.correlationId).toBe(payCorrelation);
    // OrderPaid is written by the checkout.confirm-payment command handler: its correlation proves the Rabbit hop carried it
    const orderPaid = await tap.find("OrderPaid", (e) => e.payload.orderId === orderId, "OrderPaid");
    expect(orderPaid.envelope!.correlationId).toBe(payCorrelation);
    expect(orderPaid.envelope!.causationId).toBeTruthy();
    expect(orderPaid.envelope!.causationId).not.toBe(succeeded.envelope!.messageId);
    const committed = await tap.find("StockCommitted", (e) => e.payload.orderId === orderId, "StockCommitted");
    expect(committed.envelope!.correlationId).toBe(payCorrelation);
    const confirmation = await waitForDelivery(user.email, "order-confirmation");
    expect(confirmation.correlationId).toBe(payCorrelation);
    // the consumers log the handled messages under the same correlation id (checkout handled checkout.confirm-payment)
    const checkoutLog = () => readFileSync(stackLogPath("checkout-service"), "utf8").split("\n").filter((l) => l.includes(payCorrelation));
    await waitFor(() => checkoutLog().some((l) => l.includes('"msg":"message handled"') && l.includes('"command":"checkout.confirm-payment"')), "checkout log line for the handled confirm-payment command");
    const invoice = await tap.find("InvoiceIssued", (e) => e.payload.orderId === orderId, "InvoiceIssued (checkout.generate-invoice command)", 90_000);
    expect(invoice.envelope!.correlationId).toBe(payCorrelation);
  });
});
