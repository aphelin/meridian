import { beforeEach, describe, expect, it } from "vitest";
import { type CheckoutFixture, checkoutFixture } from "../../test-support/checkout-fixture";
import { ADMIN, deliveredOrder, payOrder, placeOrder } from "../../test-support/order-journeys";
import { GenerateInvoiceCommand } from "../commands/generate-invoice.command";
import { RequestRefundCommand } from "../commands/request-refund.command";
import { RequestReturnCommand } from "../commands/request-return.command";
import { GetAdminOrderQuery } from "./get-admin-order.query";
import { GetInvoiceLinkQuery } from "./get-invoice-link.query";
import { ListAdminOrdersQuery } from "./list-admin-orders.query";
import { ListReturnsQuery } from "./list-returns.query";

let f: CheckoutFixture;
beforeEach(() => {
  f = checkoutFixture();
});

const customer = (userId: string) => ({ userId, role: "customer" });

describe("GetInvoiceLink", () => {
  it("invoice link is 404 before the invoice is issued and a short-lived link afterwards", async () => {
    const placed = await placeOrder(f, { userId: "user-1" });
    await payOrder(f, placed.orderId);
    const link = () => f.handlers.invoiceLink.execute(new GetInvoiceLinkQuery(placed.orderId, customer("user-1"), null));
    await expect(link()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await f.handlers.generateInvoice.execute(new GenerateInvoiceCommand(placed.orderId));
    expect(await link()).toEqual({ url: expect.stringContaining("invoices/2026/INV-2026-000001.pdf?expires=300"), expiresAt: expect.any(String) });
  });

  it("invoice link is for the owner, guest token holders and admins only", async () => {
    const guest = await placeOrder(f);
    await payOrder(f, guest.orderId);
    await f.handlers.generateInvoice.execute(new GenerateInvoiceCommand(guest.orderId));
    await expect(f.handlers.invoiceLink.execute(new GetInvoiceLinkQuery(guest.orderId, customer("stranger"), null))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.handlers.invoiceLink.execute(new GetInvoiceLinkQuery(guest.orderId, null, guest.accessToken))).resolves.toHaveProperty("url");
    await expect(f.handlers.invoiceLink.execute(new GetInvoiceLinkQuery(guest.orderId, ADMIN, null))).resolves.toHaveProperty("url");
    await expect(f.handlers.invoiceLink.execute(new GetInvoiceLinkQuery("missing", ADMIN, null))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("Admin order detail", () => {
  it("admin order detail includes the payment summary and the audit trail", async () => {
    const placed = await deliveredOrder(f);
    await f.handlers.requestRefund.execute(new RequestRefundCommand(placed.orderId, "admin-1", 1000, "goodwill"));
    const detail = await f.handlers.adminOrder.execute(new GetAdminOrderQuery(placed.orderId));
    expect(detail.payment).toMatchObject({ paymentId: `pay_${placed.orderId}` });
    expect(detail.audit).toEqual([expect.objectContaining({ action: "order.refund", actorId: "admin-1", at: expect.any(String), meta: expect.objectContaining({ amountCents: 1000 }) })]);
    expect(detail.refunds).toHaveLength(1);
  });

  it("admin order detail degrades to a null payment summary when payment-service is unavailable", async () => {
    const placed = await placeOrder(f);
    f.paymentSummaries.down = true;
    const detail = await f.handlers.adminOrder.execute(new GetAdminOrderQuery(placed.orderId));
    expect(detail).toMatchObject({ id: placed.orderId, payment: null, audit: [] });
    await expect(f.handlers.adminOrder.execute(new GetAdminOrderQuery("missing"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("Admin lists", () => {
  it("admin order list filters by status, searches by number or email and pages with a cursor", async () => {
    const first = await placeOrder(f);
    f.clock.advance(1000);
    const second = await placeOrder(f, { userId: "user-2" });
    f.clock.advance(1000);
    const third = await placeOrder(f);
    await payOrder(f, second.orderId);
    const paidOnly = await f.handlers.listAdminOrders.execute(new ListAdminOrdersQuery({ status: "paid", q: null, cursor: null, limit: 20 }));
    expect(paidOnly.items.map((o) => o.id)).toEqual([second.orderId]);
    const byNumber = await f.handlers.listAdminOrders.execute(new ListAdminOrdersQuery({ status: null, q: third.order.number.toLowerCase(), cursor: null, limit: 20 }));
    expect(byNumber.items).toEqual([expect.objectContaining({ id: third.orderId, customer: expect.objectContaining({ email: "guest@example.test" }) })]);
    const page1 = await f.handlers.listAdminOrders.execute(new ListAdminOrdersQuery({ status: null, q: null, cursor: null, limit: 2 }));
    expect(page1.items.map((o) => o.id)).toEqual([third.orderId, second.orderId]);
    const page2 = await f.handlers.listAdminOrders.execute(new ListAdminOrdersQuery({ status: null, q: null, cursor: page1.nextCursor, limit: 2 }));
    expect(page2).toEqual({ items: [expect.objectContaining({ id: first.orderId })], nextCursor: null });
  });

  it("admin return queue lists requested returns with order number and customer", async () => {
    const placed = await deliveredOrder(f);
    const ret = await f.handlers.requestReturn.execute(new RequestReturnCommand(placed.orderId, customer("user-1"), null, [{ sku: "KITE-OCH", qty: 1 }], "too bright"));
    const queue = await f.handlers.listReturns.execute(new ListReturnsQuery({ status: "requested", cursor: null, limit: 20 }));
    expect(queue.items).toEqual([expect.objectContaining({ id: ret.id, orderNumber: placed.order.number, customer: expect.objectContaining({ userId: "user-1" }) })]);
    expect((await f.handlers.listReturns.execute(new ListReturnsQuery({ status: "approved", cursor: null, limit: 20 }))).items).toHaveLength(0);
  });
});
