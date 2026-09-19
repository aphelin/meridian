import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tokens } from "../support/auth";
import { CAPTCHA_TOKEN } from "../support/env";
import { catalog, checkout, identity, notification } from "../support/http";
import { type KafkaTap, kafkaTap } from "../support/kafka";
import { linkToken, mailsTo, waitForMail } from "../support/mailhog";
import { createProduct, deliver, groupStatus, paidOrder, registerUser, setStock, uniqueEmail, waitForOrderStatus } from "../support/shop";
import { holdsFor, waitFor } from "../support/wait";

describe("account deletion", () => {
  let tap: KafkaTap;
  beforeAll(async () => {
    tap = await kafkaTap(["meridian.identity", "meridian.inventory"]);
  });
  afterAll(async () => {
    await tap?.stop();
  });

  test("account deletion (UserDeleted) anonymises orders and reviews and removes wishlist, newsletter subscription and stock alerts", async () => {
    const bought = await createProduct({ priceCents: 25_000, onHand: 2 });
    const wanted = await createProduct({ priceCents: 26_000, onHand: 0 });
    const user = await registerUser("delete");
    const shopper = { token: user.accessToken, email: user.email, name: user.name };

    // an order (delivered) and a review
    const { placed } = await paidOrder(shopper, [{ sku: bought.variants[0].sku, variantId: bought.variants[0].variantId, qty: 1 }]);
    const orderId = placed.order.id as string;
    await deliver(orderId);
    await waitForOrderStatus(orderId, "delivered");
    await waitFor(async () => (await catalog().get(`/products/${bought.slug}/reviews/eligibility`, { token: user.accessToken })).json?.eligible === true, "review eligibility");
    const review = await catalog().post(`/products/${bought.slug}/reviews`, { rating: 4, title: "Good stool", body: "Sturdy and simple, as described on the page." }, { token: user.accessToken });
    expect(review.status, review.text).toBe(201);
    expect(review.json.authorName).not.toBe("Former customer");

    // wishlist, confirmed newsletter subscription, pending stock alert on a sold-out product
    const wish = await catalog().put("/wishlist", { slugs: [bought.slug, wanted.slug] }, { token: user.accessToken });
    expect(wish.json.slugs).toHaveLength(2);
    expect((await notification().post("/newsletter/subscriptions", { email: user.email }, { headers: { "x-captcha-token": CAPTCHA_TOKEN } })).status).toBe(202);
    const confirmMail = await waitForMail(user.email, (m) => /newsletter\/confirm\?token=/.test(m.body), "newsletter confirmation");
    expect((await notification().post("/newsletter/confirm", { token: linkToken(confirmMail, "/newsletter/confirm") })).status).toBe(200);
    await waitForMail(user.email, (m) => /newsletter\/unsubscribe\?token=/.test(m.body), "newsletter welcome");
    const alertSku = wanted.variants[0].sku;
    expect((await notification().post("/stock-alerts", { email: user.email, sku: alertSku, slug: wanted.slug }, { headers: { "x-captcha-token": CAPTCHA_TOKEN } })).status).toBe(202);
    // control: another shopper's alert for the same SKU must still fire later
    const control = uniqueEmail("delete-control");
    expect((await notification().post("/stock-alerts", { email: control, sku: alertSku, slug: wanted.slug }, { headers: { "x-captcha-token": CAPTCHA_TOKEN } })).status).toBe(202);

    // delete the account (wrong password first)
    const wrong = await identity().delete("/me", { token: user.accessToken, body: { password: "not-the-password" } });
    expect(wrong.status, wrong.text).toBe(403);
    const del = await identity().delete("/me", { token: user.accessToken, body: { password: user.password } });
    expect(del.status, del.text).toBe(204);
    const deleted = await tap.find("UserDeleted", (e) => e.payload.userId === user.id, "UserDeleted");
    expect(deleted.envelope!.payload.email).toBe(user.email);
    await waitForMail(user.email, (m) => m.subject.includes("Your Meridian account has been deleted"), "account deleted email");
    expect((await identity().post("/auth/login", { email: user.email, password: user.password })).status).toBe(401);

    // checkout-identity: orders anonymised
    await waitFor(async () => {
      const o = await checkout().get(`/admin/orders/${orderId}`, { token: tokens.admin() });
      return o.json?.customer?.email === `deleted-${user.id}@anonymised.invalid` ? o.json : null;
    }, "order anonymised by checkout-identity", { timeoutMs: 60_000 });
    const anonymised = (await checkout().get(`/admin/orders/${orderId}`, { token: tokens.admin() })).json;
    expect(anonymised.customer).toMatchObject({ userId: user.id, name: "Deleted customer" });
    expect(anonymised.shippingAddress.phone).toBeNull();

    // catalog-purchases: review anonymised, wishlist gone
    await waitFor(async () => (await catalog().get(`/products/${bought.slug}/reviews`)).json?.items?.[0]?.authorName === "Former customer", "review anonymised by catalog-purchases", { timeoutMs: 60_000 });
    expect((await catalog().get(`/products/${bought.slug}/reviews`)).json.summary.count).toBe(1);
    await waitFor(async () => (await catalog().get("/wishlist", { token: user.accessToken })).json?.slugs?.length === 0, "wishlist removed");

    // notification-dispatcher: wait until it has consumed past UserDeleted (lag 0 after the event exists)
    await waitFor(async () => (await groupStatus("notification", "notification-dispatcher"))?.lag === 0, "notification-dispatcher caught up with UserDeleted", { timeoutMs: 60_000, intervalMs: 1000 });

    // stock alerts deleted: a restock notifies the control shopper only
    await setStock(alertSku, 3, "restock after account deletion");
    await tap.find("StockReplenished", (e) => e.payload.sku === alertSku, "StockReplenished");
    await waitForMail(control, (m) => m.body.includes(wanted.slug), "control back-in-stock email");
    await holdsFor(async () => (await mailsTo(user.email)).every((m) => !m.body.includes(wanted.slug)), "no back-in-stock email to the deleted account", { windowMs: 2000 });

    // newsletter subscription removed: subscribing again starts a new double opt-in instead of a silent no-op
    const confirmationsBefore = (await mailsTo(user.email)).filter((m) => /newsletter\/confirm\?token=/.test(m.body)).length;
    expect(confirmationsBefore).toBe(1);
    expect((await notification().post("/newsletter/subscriptions", { email: user.email }, { headers: { "x-captcha-token": CAPTCHA_TOKEN } })).status).toBe(202);
    await waitFor(async () => (await mailsTo(user.email)).filter((m) => /newsletter\/confirm\?token=/.test(m.body)).length === 2, "a fresh newsletter confirmation after the subscription was removed");
  });
});
