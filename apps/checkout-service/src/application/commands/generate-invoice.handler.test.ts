import { beforeEach, describe, expect, it } from "vitest";
import { type CheckoutFixture, checkoutFixture } from "../../test-support/checkout-fixture";
import { payOrder, placeOrder } from "../../test-support/order-journeys";
import { GenerateInvoiceCommand } from "./generate-invoice.command";

let f: CheckoutFixture;
beforeEach(() => {
  f = checkoutFixture();
});

const generate = (orderId: string) => f.handlers.generateInvoice.execute(new GenerateInvoiceCommand(orderId));

async function paidOrder() {
  const placed = await placeOrder(f);
  await payOrder(f, placed.orderId);
  f.outbox.rows.length = 0;
  return placed.orderId;
}

describe("GenerateInvoice", () => {
  it("invoice generation renders the PDF, stores it and raises InvoiceIssued with a sequence number", async () => {
    const orderId = await paidOrder();
    expect(await generate(orderId)).toBe("issued");
    const order = f.orders.get(orderId);
    expect(order.invoice?.number).toBe("INV-2026-000001");
    expect(f.storage.objects.get("invoices/2026/INV-2026-000001.pdf")).toMatchObject({ contentType: "application/pdf" });
    expect(f.renderer.documents[0]).toMatchObject({ invoiceNumber: "INV-2026-000001", orderNumber: order.number, shippingMethodLabel: expect.any(String), netCents: order.pricing.totalCents - order.pricing.taxCents });
    expect(f.outbox.rows).toEqual([expect.objectContaining({ name: "InvoiceIssued", payload: expect.objectContaining({ orderId, invoiceNumber: "INV-2026-000001", totalCents: order.pricing.totalCents }) })]);
    expect(f.invoices.rows.get(orderId)).toMatchObject({ status: "issued" });
  });

  it("invoice generation is idempotent per order: one InvoiceIssued", async () => {
    const orderId = await paidOrder();
    await generate(orderId);
    expect(await generate(orderId)).toBe("already-issued");
    expect(f.outbox.named("InvoiceIssued")).toHaveLength(1);
    expect(f.renderer.documents).toHaveLength(1);
  });

  it("invoice storage failure throws for a retry that reuses the allocated number", async () => {
    const orderId = await paidOrder();
    f.storage.failures = 2;
    await expect(generate(orderId)).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    await expect(generate(orderId)).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(f.orders.get(orderId).invoice).toBeNull();
    expect(f.outbox.named("InvoiceIssued")).toHaveLength(0);
    expect(await generate(orderId)).toBe("issued");
    expect(f.orders.get(orderId).invoice?.number).toBe("INV-2026-000001");
  });

  it("invoice numbers increase from the sequence across orders", async () => {
    const first = await paidOrder();
    const second = await paidOrder();
    await generate(first);
    await generate(second);
    expect([f.orders.get(first).invoice?.number, f.orders.get(second).invoice?.number]).toEqual(["INV-2026-000001", "INV-2026-000002"]);
  });

  it("invoice for an unpaid order is INVALID_TRANSITION and for an unknown order NOT_FOUND", async () => {
    const placed = await placeOrder(f);
    await expect(generate(placed.orderId)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(generate("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.invoices.rows.size).toBe(0);
  });

  it("invoice issue survives a concurrent order update by reloading", async () => {
    const orderId = await paidOrder();
    f.orders.conflictOnce.add(orderId);
    expect(await generate(orderId)).toBe("issued");
    expect(f.outbox.named("InvoiceIssued")).toHaveLength(1);
  });
});
