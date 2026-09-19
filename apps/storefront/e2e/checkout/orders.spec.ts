import { expect, test } from "@playwright/test";
import { mailhogLink, onStore } from "../support";
import { admin, adminTransition, pickVariants, placeOrderApi, registerApi, trpcMutate, trpcQuery } from "./helpers";

type Order = {
  id: string;
  number: string;
  status: string;
  invoice: { number: string } | null;
  returns: { id: string; status: string }[];
  refunds: { status: string; amountCents: number }[];
};

/** The status chip next to the order heading (first exact match in the page body). */
const status = (page: import("@playwright/test").Page, label: string) => page.getByRole("main").getByText(label, { exact: true });

// The shared test-results dir is cleared by any other Playwright run starting on this checkout (parallel storefront
// leaves), which breaks trace recording mid-test; these specs therefore don't record traces.
test.use({ trace: "off" });

test.describe("orders", () => {
  test("shopper cancels a paid order from the confirm dialog and sees the refund", async ({ page }) => {
    const [variant] = await pickVariants(page.request, 1);
    const order = await placeOrderApi(page, [variant]);
    await page.goto(`/orders/${order.id}`);
    await expect(status(page, "Paid").first()).toBeVisible();

    await page.getByRole("button", { name: "Cancel order" }).click();
    const dialog = page.getByRole("dialog", { name: `Cancel order ${order.number}?` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/is refunded to your test payment/)).toBeVisible();
    await dialog.getByRole("button", { name: "Keep order" }).click();
    await expect(dialog).toBeHidden();
    await expect(status(page, "Paid").first()).toBeVisible();

    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, cancel order" }).click();
    await expect(page.getByText("Order cancelled. Your refund is on its way.")).toBeVisible();
    await expect(page.getByText("You cancelled this order.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);

    const refunds = page.getByRole("list", { name: "Refunds" });
    await expect(refunds.getByRole("listitem")).toHaveCount(1, { timeout: 30_000 });
    await expect(refunds.getByText("Refunded", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("list", { name: "Order timeline" }).getByText("Cancelled", { exact: true })).toBeVisible();
  });

  test("shopper requests a return with the line and quantity picker and sees the approved refund", async ({ page }) => {
    const [variant] = await pickVariants(page.request, 1);
    const order = await placeOrderApi(page, [variant], { qty: 2 });
    await adminTransition(order.id, "fulfilling", "shipped", "delivered");
    await page.goto(`/orders/${order.id}`);
    await expect(status(page, "Delivered").first()).toBeVisible();

    await page.getByRole("button", { name: "Request a return" }).click();
    const dialog = page.getByRole("dialog", { name: "Request a return" });
    const send = dialog.getByRole("button", { name: "Send return request" });
    // Nothing picked and no reason: both are named under their fields.
    await send.click();
    await expect(dialog.getByText("Choose at least one piece to return.")).toBeVisible();
    await expect(dialog.getByText("Tell us why you’re returning it.")).toBeVisible();
    await dialog.getByRole("checkbox", { name: `Return ${variant.name}, ${variant.variantLabel}` }).click();
    await expect(dialog.getByText("2 returnable")).toBeVisible();
    await dialog.getByRole("button", { name: `Increase ${variant.name} return quantity` }).click();
    await dialog.getByRole("button", { name: `Decrease ${variant.name} return quantity` }).click();
    await expect(dialog.getByRole("group", { name: `${variant.name} return quantity` })).toContainText("1");
    await dialog.getByLabel("Reason for the return").fill("The oak is lighter than the rest of the room.");
    await send.click();

    await expect(page.getByText("Return requested. We’ll email you once it’s reviewed.")).toBeVisible();
    const returns = page.getByRole("list", { name: "Returns" });
    await expect(returns.getByText("Awaiting review")).toBeVisible();
    await expect(returns.getByText(`1 × ${variant.name} (${variant.variantLabel})`)).toBeVisible();

    const placed = await trpcQuery<Order>(page.request, "orders.byId", { id: order.id });
    await trpcMutate(await admin(), "admin.returns.decide", { id: placed.returns[0].id, approve: true, restock: true });
    await expect
      .poll(async () => (await trpcQuery<Order>(page.request, "orders.byId", { id: order.id })).refunds.map((r) => r.status).join(), { timeout: 60_000 })
      .toBe("succeeded");

    await page.reload();
    await expect(returns.getByText("Refunded", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Refunds" }).getByText("Refunded", { exact: true })).toBeVisible();
    await expect(status(page, "Partly refunded").first()).toBeVisible();
    // One piece is still returnable.
    await page.getByRole("button", { name: "Request a return" }).click();
    await expect(page.getByRole("dialog").getByText("1 returnable")).toBeVisible();
  });

  test("invoice download saves the issued invoice PDF", async ({ page }) => {
    const [variant] = await pickVariants(page.request, 1);
    const order = await placeOrderApi(page, [variant]);
    await expect.poll(async () => (await trpcQuery<Order>(page.request, "orders.byId", { id: order.id })).invoice?.number ?? "", { timeout: 60_000 }).toMatch(/^INV-/);
    await page.goto(`/orders/${order.id}`);

    const download = page.getByRole("button", { name: /^Download invoice INV-\d{4}-\d+$/ });
    await expect(download).toBeVisible();
    const [file, response] = await Promise.all([
      page.waitForEvent("download"),
      page.waitForResponse((r) => r.url().includes("orders.invoice") && r.request().method() === "GET"),
      download.click(),
    ]);
    const invoiceNumber = (await download.textContent())!.replace("Download invoice", "").trim();
    expect(file.suggestedFilename()).toBe(`${invoiceNumber}.pdf`);
    expect(file.url()).toContain(invoiceNumber);
    expect(response.ok()).toBe(true);
    const link = JSON.stringify(await response.json()).match(/https?:\/\/[^"]+\.pdf[^"]*/)?.[0];
    expect(link, "invoice link in the BFF response").toBeTruthy();
    const pdf = await page.request.get(link!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    // The shopper stays on the order page.
    await expect(page.getByRole("heading", { level: 1, name: `Order ${order.number}` })).toBeVisible();
  });

  test("order timeline and tracking link appear after the order ships", async ({ page }) => {
    const [variant] = await pickVariants(page.request, 1);
    const order = await placeOrderApi(page, [variant]);
    await adminTransition(order.id, "fulfilling", "shipped");
    const shipped = await trpcQuery<{ fulfillment: { trackingNumber: string } }>(page.request, "orders.byId", { id: order.id });
    await page.goto(`/orders/${order.id}`);

    await expect(status(page, "Shipped").first()).toBeVisible();
    const tracking = page.getByRole("link", { name: `Track parcel ${shipped.fulfillment.trackingNumber}` });
    await expect(tracking).toHaveAttribute("href", /^https:\/\/.*dhl.*/);
    await expect(tracking).toHaveAttribute("target", "_blank");
    await expect(page.getByText("Shipped with DHL")).toBeVisible();

    const timeline = page.getByRole("list", { name: "Order timeline" });
    for (const step of ["Placed", "Paid", "Preparing", "Shipped"]) await expect(timeline.getByText(step, { exact: true })).toBeVisible();
    await expect(timeline.getByText(`DHL ${shipped.fulfillment.trackingNumber}`)).toBeVisible();
    const progress = page.getByRole("list", { name: "Order progress" });
    await expect(progress.getByRole("listitem").nth(3)).toHaveAttribute("aria-current", "step");
    // Shoppers never see admin actions.
    await expect(page.getByRole("button", { name: /mark|ship|deliver|refund/i })).toHaveCount(0);
  });

  test("guest order is forbidden in another browser without the access link and opens with it", async ({ page, browser, baseURL }) => {
    const [variant] = await pickVariants(page.request, 1);
    const order = await placeOrderApi(page, [variant]);

    const other = await browser.newContext({ baseURL });
    try {
      const stranger = await other.newPage();
      await stranger.goto(`/orders/${order.id}`);
      await expect(stranger.getByRole("heading", { name: "You don’t have access to this order" })).toBeVisible();
      await expect(stranger.getByText(/^Reference: [0-9a-f-]{36}$/)).toBeVisible();
      await expect(stranger.getByText(order.number)).toHaveCount(0);

      const link = await mailhogLink(order.email, new RegExp(`/orders/${order.id}\\?access=`), { timeoutMs: 90_000 });
      await stranger.goto(onStore(link));
      await expect(stranger.getByRole("heading", { level: 1, name: `Order ${order.number}` })).toBeVisible();
      // The token is moved into an httpOnly cookie and removed from the address bar.
      await expect(stranger).toHaveURL(new RegExp(`/orders/${order.id}$`));
      const cookie = (await other.cookies()).find((c) => c.name === `oa_${order.id}`);
      expect(cookie?.httpOnly).toBe(true);
      expect(await stranger.evaluate(() => document.cookie)).not.toContain("oa_");
      await stranger.reload();
      await expect(stranger.getByRole("heading", { level: 1, name: `Order ${order.number}` })).toBeVisible({ timeout: 30_000 });
    } finally {
      await other.close();
    }
  });

  test("order history lists the signed-in shopper's orders", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Sign in to see your orders" })).toBeVisible({ timeout: 60_000 });

    await registerApi(page, "history");
    await page.reload();
    await expect(page.getByRole("heading", { name: "No orders yet" })).toBeVisible();

    const [variant] = await pickVariants(page.request, 1);
    const order = await placeOrderApi(page, [variant]);
    await page.reload();
    const row = page.getByRole("link", { name: new RegExp(`^Order ${order.number}, Paid, `) });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: `Order ${order.number}` })).toBeVisible();
  });
});
