import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tokens } from "../support/auth";
import { checkout } from "../support/http";
import { type KafkaTap, kafkaTap } from "../support/kafka";
import { waitForMail } from "../support/mailhog";
import { adminStock, createProduct, deliver, paidOrder, paymentSummary, registerUser, waitForOrderStatus } from "../support/shop";
import { holdsFor, waitFor } from "../support/wait";

describe("returns", () => {
  let tap: KafkaTap;
  beforeAll(async () => {
    tap = await kafkaTap(["meridian.checkout", "meridian.payment", "meridian.inventory"]);
  });
  afterAll(async () => {
    await tap?.stop();
  });

  test("return approved with restock refunds through payment-service and raises inventory; a second return is rejected without refund or restock", async () => {
    const product = await createProduct({ priceCents: 40_000, onHand: 4 });
    const [v] = product.variants;
    const user = await registerUser("returns", { verify: false });
    const shopper = { token: user.accessToken, email: user.email, name: user.name };
    const { placed } = await paidOrder(shopper, [{ sku: v.sku, variantId: v.variantId, qty: 3 }], { couponCode: "NORTH-10" });
    const orderId = placed.order.id as string;
    const number = placed.order.number as string;
    await waitFor(async () => (await adminStock(v.sku)).onHand === 1, "stock committed on payment (4 - 3)");

    // not returnable before delivery
    const early = await checkout().post(`/orders/${orderId}/returns`, { lines: [{ sku: v.sku, qty: 1 }], reason: "changed my mind" }, { token: user.accessToken });
    expect(early.status, early.text).toBe(409);
    expect(early.json.code).toBe("ORDER_NOT_RETURNABLE");
    await deliver(orderId);
    await waitForOrderStatus(orderId, "delivered");

    // request → approve with restock
    const requested = await checkout().post(`/orders/${orderId}/returns`, { lines: [{ sku: v.sku, qty: 2 }], reason: "wrong finish" }, { token: user.accessToken });
    expect(requested.status, requested.text).toBe(201);
    expect(requested.json).toMatchObject({ status: "requested", orderId });
    const returnId = requested.json.id as string;
    await waitForMail(user.email, (m) => m.subject.includes(`We received your return request for order ${number}`), "return received email");
    const queue = await checkout().get("/admin/returns?status=requested", { token: tokens.admin() });
    expect(queue.json.items.some((r: { id: string }) => r.id === returnId)).toBe(true);

    const approve = await checkout().post(`/admin/returns/${returnId}/decision`, { approve: true, restock: true }, { token: tokens.admin() });
    expect(approve.status, approve.text).toBeLessThan(300);
    // default refund = returned line totals with the 10% discount pro-rated: 2 × 40 000 × 0.9
    const approved = await tap.find("ReturnApproved", (e) => e.payload.returnId === returnId, "return approved");
    expect(approved.envelope!.payload).toMatchObject({ refundCents: 72_000, restock: true });
    await tap.find("PaymentRefunded", (e) => e.payload.orderId === orderId && e.payload.amountCents === 72_000, "payment-service refunds the return");
    await tap.find("OrderRefunded", (e) => e.payload.orderId === orderId && e.payload.amountCents === 72_000 && e.payload.full === false, "checkout records the return refund");
    const restocked = await tap.find("StockAdjusted", (e) => e.payload.sku === v.sku && e.payload.onHand === 3, "inventory.restock applied");
    expect(restocked.envelope!.payload.available).toBe(3);
    expect(await adminStock(v.sku)).toMatchObject({ onHand: 3, reserved: 0, available: 3 });

    const afterApprove = await waitForOrderStatus(orderId, (o) => o.status === "partially_refunded" && o.returns.some((r: { id: string; status: string }) => r.id === returnId && r.status === "refunded"));
    expect(afterApprove.refundedCents).toBe(72_000);
    expect(await paymentSummary(orderId)).toMatchObject({ status: "partially_refunded", refundedCents: 72_000 });
    await waitForMail(user.email, (m) => m.subject.includes(`Return approved for order ${number}`), "return approved email");

    // over-return is refused: 3 bought, 2 already returned
    const tooMany = await checkout().post(`/orders/${orderId}/returns`, { lines: [{ sku: v.sku, qty: 2 }], reason: "more" }, { token: user.accessToken });
    expect(tooMany.status, tooMany.text).toBe(409);

    // second return for the last unit → rejected: no refund command outcome, no restock
    const second = await checkout().post(`/orders/${orderId}/returns`, { lines: [{ sku: v.sku, qty: 1 }], reason: "also this one" }, { token: user.accessToken });
    expect(second.status, second.text).toBe(201);
    const reject = await checkout().post(`/admin/returns/${second.json.id}/decision`, { approve: false, note: "Used beyond inspection" }, { token: tokens.admin() });
    expect(reject.status, reject.text).toBeLessThan(300);
    await tap.find("ReturnRejected", (e) => e.payload.returnId === second.json.id && e.payload.note === "Used beyond inspection", "return rejected");
    await waitForMail(user.email, (m) => m.subject.includes(`Update on your return for order ${number}`) && m.body.includes("Used beyond inspection"), "return rejected email");
    const again = await checkout().post(`/admin/returns/${second.json.id}/decision`, { approve: true }, { token: tokens.admin() });
    expect(again.status).toBe(409);
    await holdsFor(
      async () => {
        const s = await adminStock(v.sku);
        return s.onHand === 3 && tap.count((r) => r.envelope?.name === "PaymentRefunded" && r.envelope.payload.orderId === orderId) === 1;
      },
      "rejected return neither restocks nor refunds",
      { windowMs: 3000 },
    );
    const final = await checkout().get(`/orders/${orderId}`, { token: user.accessToken });
    expect(final.json.status).toBe("partially_refunded");
    expect(final.json.refundedCents).toBe(72_000);
    expect(final.json.returns.find((r: { id: string }) => r.id === second.json.id)).toMatchObject({ status: "rejected", note: "Used beyond inspection" });
  });
});
