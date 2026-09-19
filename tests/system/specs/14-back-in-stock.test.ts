import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { CAPTCHA_TOKEN } from "../support/env";
import { inventory, notification } from "../support/http";
import { type KafkaTap, kafkaTap } from "../support/kafka";
import { mailsTo, waitForMail } from "../support/mailhog";
import { createProduct, searchHit, setStock, uniqueEmail, waitForDelivery } from "../support/shop";
import { holdsFor, waitFor } from "../support/wait";

describe("back in stock", () => {
  let tap: KafkaTap;
  beforeAll(async () => {
    tap = await kafkaTap(["meridian.inventory"]);
  });
  afterAll(async () => {
    await tap?.stop();
  });

  test("back-in-stock alert email after an admin restock (StockReplenished → notification-dispatcher), sent once per alert", async () => {
    const product = await createProduct({ priceCents: 33_000 });
    const [v] = product.variants;
    const depleted = await setStock(v.sku, 0, "sold out for the alert test");
    expect(depleted.available).toBe(0);
    await tap.find("StockDepleted", (e) => e.payload.sku === v.sku, "StockDepleted");
    await waitFor(async () => (await searchHit(product.name, product.slug))?.inStock === false, "search shows the product sold out", { timeoutMs: 60_000 });

    const email = uniqueEmail("alert");
    const noCaptcha = await notification().post("/stock-alerts", { email, sku: v.sku, slug: product.slug });
    expect(noCaptcha.status).toBe(400);
    const alert = await notification().post("/stock-alerts", { email, sku: v.sku, slug: product.slug }, { headers: { "x-captcha-token": CAPTCHA_TOKEN } });
    expect(alert.status, alert.text).toBe(202);
    // one pending alert per email + sku
    const duplicate = await notification().post("/stock-alerts", { email, sku: v.sku, slug: product.slug }, { headers: { "x-captcha-token": CAPTCHA_TOKEN } });
    expect(duplicate.status, duplicate.text).toBe(202);

    // admin restock → StockAdjusted + StockReplenished → back-in-stock email linking the product
    const restocked = await setStock(v.sku, 4, "supplier delivery");
    expect(restocked).toMatchObject({ onHand: 4, available: 4 });
    const replenished = await tap.find("StockReplenished", (e) => e.payload.sku === v.sku, "StockReplenished");
    expect(replenished.envelope!.payload.available).toBe(4);
    const mail = await waitForMail(email, (m) => m.body.includes(`/product/${product.slug}`), "back-in-stock email");
    expect(mail.subject).toContain("[Meridian sandbox]");
    expect(mail.subject).toMatch(/back in stock/i);
    const delivery = await waitForDelivery(email, "back-in-stock");
    expect(delivery.correlationId).toBe(replenished.envelope!.correlationId);
    expect((await inventory().get(`/stock/${v.sku}`)).json.available).toBe(4);
    await waitFor(async () => (await searchHit(product.name, product.slug))?.inStock === true, "search shows the product in stock again", { timeoutMs: 60_000 });

    // the alert is marked notified: selling out and restocking again sends nothing more
    await setStock(v.sku, 0, "sold out again");
    await setStock(v.sku, 2, "second delivery");
    await tap.find("StockReplenished", (e) => e.payload.sku === v.sku && e.payload.available === 2, "second StockReplenished");
    await holdsFor(async () => (await mailsTo(email)).length === 1, "exactly one back-in-stock email", { windowMs: 3000 });
  });
});
