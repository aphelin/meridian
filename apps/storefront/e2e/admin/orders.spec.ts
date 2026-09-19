import { expect, mutate, paidGuestOrder, query, test } from "./fixtures";

test("order transitions: start fulfilment, ship with carrier and tracking, then deliver", async ({ page, admin }) => {
  const order = await paidGuestOrder(admin);
  try {
    await page.goto("/admin/orders");
    await page.getByRole("searchbox", { name: "Search orders" }).fill(order.number);
    await page.getByRole("search", { name: "Search orders" }).getByRole("button", { name: "Search" }).click();
    const table = page.getByRole("table", { name: "Orders" });
    await expect(table.getByRole("row")).toHaveCount(2, { timeout: 20_000 });
    await table.getByRole("link", { name: order.number }).click();

    await expect(page.getByRole("heading", { level: 1, name: `Order ${order.number}` })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Correlation id")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy correlation id" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
    // The provider that took the payment: Stripe test mode when configured, else the local sandbox.
    await expect(page.getByText(/^(stripe-test|local-sandbox)$/)).toBeVisible();
    await expect(page.getByText(order.email).first()).toBeVisible();

    await page.getByRole("button", { name: "Start fulfilment" }).click();
    const ship = page.getByRole("form", { name: "Ship order" });
    await expect(ship).toBeVisible({ timeout: 20_000 });

    await ship.getByRole("button", { name: "Mark shipped" }).click();
    await expect(ship.getByText("Enter the carrier.")).toBeVisible();
    await expect(ship.getByText("Enter the tracking number.")).toBeVisible();

    const tracking = `E2EADM${Date.now()}`;
    await ship.getByLabel("Carrier").fill("DHL");
    await ship.getByLabel("Tracking number").fill(tracking);
    await ship.getByRole("button", { name: "Mark shipped" }).click();
    await expect(page.getByRole("link", { name: tracking })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: tracking })).toHaveAttribute("href", /^https?:\/\//);

    await page.getByRole("button", { name: "Mark delivered" }).click();
    await expect(page.getByText("No fulfilment steps are available in this state.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark delivered" })).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("list", { name: "Timeline" }).getByText("Delivered", { exact: true })).toBeVisible();

    const audit = page.getByRole("region", { name: "Audit trail" });
    await expect(audit.getByRole("listitem")).toHaveCount(3);
  } finally {
    await order.guest.dispose();
  }
});

test("refund dialog validates the amount and records a partial refund", async ({ page, admin }) => {
  const order = await paidGuestOrder(admin);
  try {
    await page.goto(`/admin/orders/${order.id}`);
    await expect(page.getByRole("heading", { level: 1, name: `Order ${order.number}` })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Refund", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: `Refund order ${order.number}` });
    const amount = dialog.getByLabel("Refund amount (€)");
    expect(Number(await amount.inputValue())).toBe(order.totalCents / 100);
    await amount.fill(String(order.totalCents / 100 + 1));
    await dialog.getByRole("button", { name: /^Refund/ }).click();
    await expect(dialog.getByText(/Enter an amount between €0\.01 and/)).toBeVisible();
    await expect(dialog.getByText("Give a reason for the refund.")).toBeVisible();

    await amount.fill("abc");
    await expect(dialog.getByText("Enter an amount in euros, like 25 or 25.50.")).toBeVisible();

    await amount.fill("10");
    await dialog.getByLabel("Reason").fill("E2E goodwill partial refund");
    await dialog.getByRole("button", { name: "Refund €10" }).click();
    await expect(page.getByText("Refund requested")).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toBeHidden();

    const refunds = page.getByRole("region", { name: "Refunds" });
    await expect(refunds.getByText("€10", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole("region", { name: "Refunds" }).getByText("succeeded")).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 45_000 });
  } finally {
    await order.guest.dispose();
  }
});

test("orders list filters by status and expires unpaid orders on demand", async ({ page }) => {
  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("combobox", { name: "Order status" }).click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  const table = page.getByRole("table", { name: "Orders" });
  await expect(table).toBeVisible({ timeout: 20_000 });
  await expect(table.getByText("Paid", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(table.getByText(/^(Awaiting payment|Preparing|Shipped|Delivered|Cancelled|Refunded|Partly refunded)$/)).toHaveCount(0, { timeout: 20_000 });

  await page.getByRole("button", { name: "Expire unpaid orders" }).click();
  await page.getByRole("dialog", { name: "Expire unpaid orders?" }).getByRole("button", { name: "Expire now" }).click();
  await expect(page.getByText(/^(Expired \d+ unpaid orders?|No unpaid orders past their hold)$/)).toBeVisible({ timeout: 20_000 });
});

test("return queue: approve with refund and restock, reject with a note", async ({ page, admin }) => {
  const approveOrder = await paidGuestOrder(admin);
  const rejectOrder = await paidGuestOrder(admin);
  try {
    for (const o of [approveOrder, rejectOrder]) {
      for (const status of ["fulfilling", "shipped", "delivered"] as const) {
        await mutate(admin, "admin.orders.transition", status === "shipped" ? { id: o.id, status, carrier: "DPD", trackingNumber: `RET${Date.now()}` } : { id: o.id, status });
      }
      await mutate(o.guest, "orders.requestReturn", { id: o.id, lines: [{ sku: o.pick.sku, qty: 1 }], reason: "E2E: colour differs from the photos" });
    }

    await page.goto("/admin/returns");
    await expect(page.getByRole("heading", { level: 1, name: "Returns" })).toBeVisible({ timeout: 30_000 });

    const approveCard = page.getByRole("listitem", { name: `Return for ${approveOrder.number}` });
    await expect(approveCard).toBeVisible({ timeout: 20_000 });
    await expect(approveCard.getByText("“E2E: colour differs from the photos”")).toBeVisible();
    await approveCard.getByRole("button", { name: `Approve return for ${approveOrder.number}` }).click();
    const approve = page.getByRole("dialog", { name: `Approve return for ${approveOrder.number}` });
    await expect(approve.getByRole("switch", { name: "Restock returned pieces" })).toBeChecked();
    await approve.getByRole("button", { name: "Approve and refund" }).click();
    await expect(page.getByText(`Return for ${approveOrder.number} approved`)).toBeVisible({ timeout: 20_000 });
    await expect(approveCard).toBeHidden({ timeout: 20_000 });

    const rejectCard = page.getByRole("listitem", { name: `Return for ${rejectOrder.number}` });
    await rejectCard.getByRole("button", { name: `Reject return for ${rejectOrder.number}` }).click();
    const reject = page.getByRole("dialog", { name: `Reject return for ${rejectOrder.number}` });
    await reject.getByRole("button", { name: "Reject return" }).click();
    await expect(reject.getByText("Tell the customer why the return is rejected.")).toBeVisible();
    await reject.getByLabel("Note to the customer").fill("Outside our returns policy for used items.");
    await reject.getByRole("button", { name: "Reject return" }).click();
    await expect(page.getByText(`Return for ${rejectOrder.number} rejected`)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("combobox", { name: "Return status" }).click();
    await page.getByRole("option", { name: "Rejected" }).click();
    await expect(page.getByRole("listitem", { name: `Return for ${rejectOrder.number}` }).getByText("Outside our returns policy for used items.", { exact: false })).toBeVisible({ timeout: 20_000 });

    await expect(async () => {
      const detail = await query<{ returns: { status: string; refundCents: number | null }[] }>(admin, "admin.orders.byId", { id: approveOrder.id });
      expect(["approved", "refunded"]).toContain(detail.returns[0]?.status);
    }).toPass({ timeout: 30_000 });
  } finally {
    await approveOrder.guest.dispose();
    await rejectOrder.guest.dispose();
  }
});
