import { beforeEach, describe, expect, it } from "vitest";
import { type CheckoutFixture, checkoutFixture } from "../../test-support/checkout-fixture";
import { ADMIN, deliveredOrder, payOrder, placeOrder } from "../../test-support/order-journeys";
import { CancelOrderCommand } from "./cancel-order.command";
import { DecideReturnCommand } from "./decide-return.command";
import { RecordRefundOutcomeCommand } from "./record-refund-outcome.command";
import { RequestRefundCommand } from "./request-refund.command";
import { RequestReturnCommand } from "./request-return.command";
import { TransitionOrderCommand } from "./transition-order.command";

let f: CheckoutFixture;
beforeEach(() => {
  f = checkoutFixture();
});

const customer = (userId: string) => ({ userId, role: "customer" });
const recordRefund = (orderId: string, refundId: string, amountCents: number, status: "succeeded" | "failed" = "succeeded") =>
  f.handlers.recordRefund.execute(new RecordRefundOutcomeCommand({ orderId, refundId, amountCents, status, reason: status === "failed" ? "card expired" : null }));

describe("CancelOrder", () => {
  it("guest cancel of a placed order with the access token releases the stock, voids the open payment and gives the coupon back", async () => {
    const placed = await placeOrder(f, { lines: [{ sku: "HOLT-CHA-3", variantId: "charcoal", qty: 1 }], couponCode: "NORTH-10" });
    expect(f.coupons.redemptions).toHaveLength(1);
    f.outbox.rows.length = 0;
    const dto = await f.handlers.cancelOrder.execute(new CancelOrderCommand(placed.orderId, null, placed.accessToken));
    expect(dto).toMatchObject({ status: "cancelled", cancellationReason: "customer", actions: { cancel: false } });
    expect(f.outbox.rows.map((row) => row.name)).toEqual(["OrderCancelled", "inventory.release-reservation", "payment.void"]);
    expect(f.outbox.named("inventory.release-reservation")[0].payload).toEqual({ orderId: placed.orderId, reason: "cancelled" });
    expect(f.outbox.named("payment.void")[0].payload).toEqual({ orderId: placed.orderId, transactionId: expect.any(String), reason: "Order cancelled (customer) before payment" });
    expect(f.coupons.redemptions).toHaveLength(0);
    expect(f.audit.entries).toHaveLength(0);
  });

  it("cancel needs the owner, the access token or an admin (403) and a known order (404)", async () => {
    const placed = await placeOrder(f);
    await expect(f.handlers.cancelOrder.execute(new CancelOrderCommand(placed.orderId, null, null))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.handlers.cancelOrder.execute(new CancelOrderCommand(placed.orderId, customer("stranger"), "wrong"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.handlers.cancelOrder.execute(new CancelOrderCommand("missing", customer("u"), null))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.orders.get(placed.orderId).status).toBe("placed");
  });

  it("customer cancel of a paid order in fulfilment refunds the paid amount and restocks, never releases", async () => {
    const placed = await placeOrder(f, { userId: "user-1" });
    await payOrder(f, placed.orderId);
    await f.handlers.transition.execute(new TransitionOrderCommand(placed.orderId, ADMIN.userId, { status: "fulfilling" }));
    f.outbox.rows.length = 0;
    await f.handlers.cancelOrder.execute(new CancelOrderCommand(placed.orderId, customer("user-1"), null));
    expect(f.outbox.rows.map((row) => row.name)).toEqual(["OrderCancelled", "payment.refund", "inventory.restock"]);
    const refund = f.outbox.named("payment.refund")[0].payload as { amountCents: number; returnId: string | null; refundId: string };
    expect(refund).toMatchObject({ orderId: placed.orderId, amountCents: 58_900, returnId: null });
    expect(f.outbox.named("inventory.restock")[0].payload).toEqual({ orderId: placed.orderId, returnId: null, lines: [{ sku: "KITE-OCH", qty: 1 }] });
    expect(f.outbox.named("OrderCancelled")[0].payload).toMatchObject({ reason: "customer", refundRequired: true });
    expect(f.orders.get(placed.orderId).refunds).toEqual([expect.objectContaining({ id: refund.refundId, status: "pending" })]);
  });

  it("admin cancel uses reason admin and writes an audit row", async () => {
    const placed = await placeOrder(f, { userId: "user-1" });
    const dto = await f.handlers.cancelOrder.execute(new CancelOrderCommand(placed.orderId, ADMIN, null));
    expect(dto.cancellationReason).toBe("admin");
    expect(f.audit.entries).toEqual([expect.objectContaining({ action: "order.cancel", actorId: "admin-1", orderId: placed.orderId })]);
  });

  it("cancel after shipping is ORDER_NOT_CANCELLABLE and writes nothing", async () => {
    const placed = await deliveredOrder(f);
    await expect(f.handlers.cancelOrder.execute(new CancelOrderCommand(placed.orderId, customer("user-1"), null))).rejects.toMatchObject({ code: "ORDER_NOT_CANCELLABLE" });
    expect(f.outbox.rows).toHaveLength(0);
  });

  it("cancel retries after losing a concurrency race", async () => {
    const placed = await placeOrder(f);
    f.orders.conflictOnce.add(placed.orderId);
    await f.handlers.cancelOrder.execute(new CancelOrderCommand(placed.orderId, null, placed.accessToken));
    expect(f.outbox.named("OrderCancelled")).toHaveLength(1);
  });
});

describe("TransitionOrder", () => {
  it("transition to shipped emits OrderShipped with a tracking url and audits the admin", async () => {
    const placed = await placeOrder(f, { userId: "user-1" });
    await payOrder(f, placed.orderId);
    await f.handlers.transition.execute(new TransitionOrderCommand(placed.orderId, "admin-7", { status: "fulfilling" }));
    const dto = await f.handlers.transition.execute(new TransitionOrderCommand(placed.orderId, "admin-7", { status: "shipped", carrier: "DHL", trackingNumber: "JD0001" }));
    expect(dto.fulfillment.trackingUrl).toMatch(/dhl\.com.*JD0001/);
    expect(f.outbox.named("OrderShipped")[0].payload).toMatchObject({ carrier: "DHL", trackingNumber: "JD0001" });
    expect(f.audit.entries.map((entry) => [entry.action, entry.actorId, entry.meta.to])).toEqual([
      ["order.transition", "admin-7", "fulfilling"],
      ["order.transition", "admin-7", "shipped"],
    ]);
  });

  it("invalid transition is rejected without an audit row", async () => {
    const placed = await placeOrder(f);
    await payOrder(f, placed.orderId);
    await expect(f.handlers.transition.execute(new TransitionOrderCommand(placed.orderId, "admin", { status: "delivered" }))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(f.handlers.transition.execute(new TransitionOrderCommand("missing", "admin", { status: "fulfilling" }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.audit.entries).toHaveLength(0);
  });
});

describe("Refunds", () => {
  it("admin refund sends payment.refund and writes an audit row", async () => {
    const placed = await deliveredOrder(f);
    const refund = await f.handlers.requestRefund.execute(new RequestRefundCommand(placed.orderId, "admin-1", 10_000, "goodwill"));
    expect(refund).toMatchObject({ amountCents: 10_000, reason: "goodwill", status: "pending" });
    expect(f.outbox.named("payment.refund")[0].payload).toEqual({ orderId: placed.orderId, refundId: refund.id, amountCents: 10_000, reason: "goodwill", returnId: null });
    expect(f.audit.entries).toEqual([expect.objectContaining({ action: "order.refund", actorId: "admin-1", meta: expect.objectContaining({ amountCents: 10_000 }) })]);
  });

  it("refund above paid − refunded − pending is VALIDATION_FAILED", async () => {
    const placed = await deliveredOrder(f);
    await f.handlers.requestRefund.execute(new RequestRefundCommand(placed.orderId, "admin-1", 300_000, "big"));
    await expect(f.handlers.requestRefund.execute(new RequestRefundCommand(placed.orderId, "admin-1", 13_201, "over"))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(f.outbox.named("payment.refund")).toHaveLength(1);
  });

  it("record refund outcome is idempotent: one OrderRefunded per refund", async () => {
    const placed = await deliveredOrder(f);
    const refund = await f.handlers.requestRefund.execute(new RequestRefundCommand(placed.orderId, "admin-1", 10_000, "goodwill"));
    expect(await recordRefund(placed.orderId, refund.id, 10_000)).toBe("recorded");
    expect(await recordRefund(placed.orderId, refund.id, 10_000)).toBe("duplicate");
    expect(f.outbox.named("OrderRefunded")).toHaveLength(1);
    expect(f.outbox.named("OrderRefunded")[0].payload).toMatchObject({ refundId: refund.id, amountCents: 10_000, totalRefundedCents: 10_000, full: false });
    expect(f.orders.get(placed.orderId)).toMatchObject({ status: "partially_refunded", refundedCents: 10_000 });
  });

  it("a failed refund is recorded, visible and frees the amount for another refund", async () => {
    const placed = await deliveredOrder(f);
    const refund = await f.handlers.requestRefund.execute(new RequestRefundCommand(placed.orderId, "admin-1", 313_200, "all"));
    expect(await recordRefund(placed.orderId, refund.id, 313_200, "failed")).toBe("recorded");
    expect(f.orders.get(placed.orderId).refunds[0]).toMatchObject({ status: "failed", failureReason: "card expired" });
    expect(f.outbox.named("OrderRefunded")).toHaveLength(0);
    await expect(f.handlers.requestRefund.execute(new RequestRefundCommand(placed.orderId, "admin-1", 313_200, "retry"))).resolves.toMatchObject({ status: "pending" });
  });

  it("refund outcome for an unknown order is NOT_FOUND; for a never-paid order it is ignored", async () => {
    await expect(recordRefund("missing", "r1", 100)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const placed = await placeOrder(f);
    expect(await recordRefund(placed.orderId, "r1", 100)).toBe("ignored");
    expect(f.orders.get(placed.orderId).refunds).toHaveLength(0);
  });
});

describe("Returns", () => {
  it("return request by the owner raises ReturnRequested; strangers are FORBIDDEN", async () => {
    const placed = await deliveredOrder(f);
    await expect(f.handlers.requestReturn.execute(new RequestReturnCommand(placed.orderId, customer("stranger"), null, [{ sku: "KITE-OCH", qty: 1 }], "x"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ret = await f.handlers.requestReturn.execute(new RequestReturnCommand(placed.orderId, customer("user-1"), null, [{ sku: "KITE-OCH", qty: 1 }], "too bright"));
    expect(ret).toMatchObject({ orderId: placed.orderId, status: "requested", reason: "too bright", refundCents: null });
    expect(f.outbox.named("ReturnRequested")[0].payload).toMatchObject({ returnId: ret.id, reason: "too bright", lines: [{ sku: "KITE-OCH", qty: 1 }] });
  });

  it("return quantity above purchased minus open returns is ORDER_NOT_RETURNABLE", async () => {
    const placed = await deliveredOrder(f);
    const request = (qty: number) => f.handlers.requestReturn.execute(new RequestReturnCommand(placed.orderId, customer("user-1"), null, [{ sku: "KITE-OCH", qty }], "r"));
    await expect(request(3)).rejects.toMatchObject({ code: "ORDER_NOT_RETURNABLE" });
    await request(1);
    await expect(request(2)).rejects.toMatchObject({ code: "ORDER_NOT_RETURNABLE" });
  });

  it("return approval refunds the pro-rated amount, restocks and audits", async () => {
    const placed = await deliveredOrder(f);
    const ret = await f.handlers.requestReturn.execute(new RequestReturnCommand(placed.orderId, customer("user-1"), null, [{ sku: "KITE-OCH", qty: 1 }], "too bright"));
    f.outbox.rows.length = 0;
    const decided = await f.handlers.decideReturn.execute(new DecideReturnCommand(ret.id, "admin-1", { approve: true, restock: true }));
    expect(decided).toMatchObject({ id: ret.id, status: "approved", refundCents: 48_600 });
    expect(f.outbox.rows.map((row) => row.name)).toEqual(["ReturnApproved", "payment.refund", "inventory.restock"]);
    const refund = f.outbox.named("payment.refund")[0].payload as { refundId: string };
    expect(refund).toMatchObject({ amountCents: 48_600, returnId: ret.id });
    expect(f.outbox.named("inventory.restock")[0].payload).toEqual({ orderId: placed.orderId, returnId: ret.id, lines: [{ sku: "KITE-OCH", qty: 1 }] });
    expect(f.audit.entries).toEqual([expect.objectContaining({ action: "return.approve", actorId: "admin-1", orderId: placed.orderId })]);
    await recordRefund(placed.orderId, refund.refundId, 48_600);
    expect(f.orders.get(placed.orderId).returns[0].status).toBe("refunded");
  });

  it("return rejection neither refunds nor restocks and cannot be decided twice", async () => {
    const placed = await deliveredOrder(f);
    const ret = await f.handlers.requestReturn.execute(new RequestReturnCommand(placed.orderId, customer("user-1"), null, [{ sku: "KITE-OCH", qty: 1 }], "scratched"));
    f.outbox.rows.length = 0;
    const decided = await f.handlers.decideReturn.execute(new DecideReturnCommand(ret.id, "admin-1", { approve: false, note: "Signs of use" }));
    expect(decided).toMatchObject({ status: "rejected", note: "Signs of use" });
    expect(f.outbox.rows.map((row) => row.name)).toEqual(["ReturnRejected"]);
    await expect(f.handlers.decideReturn.execute(new DecideReturnCommand(ret.id, "admin-1", { approve: true }))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(f.handlers.decideReturn.execute(new DecideReturnCommand("missing", "admin-1", { approve: true }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.audit.entries.map((entry) => entry.action)).toEqual(["return.reject"]);
  });
});
