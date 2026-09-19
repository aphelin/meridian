import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { tokens } from "../support/auth";
import { clearChaos, withChaos } from "../support/chaos";
import { checkout } from "../support/http";
import { address, adminStock, createProduct, setCart } from "../support/shop";
import { waitFor } from "../support/wait";

interface Breaker {
  name: string;
  target: string;
  state: "closed" | "open" | "half-open";
  failures: number;
  rejects: number;
}

const paymentBreaker = async (): Promise<Breaker> => {
  const r = await checkout().get("/admin/breakers", { token: tokens.admin() });
  expect(r.status, r.text).toBe(200);
  const b = (r.json as Breaker[]).find((x) => x.target === "http:payment");
  if (!b) throw new Error(`no http:payment breaker: ${r.text}`);
  return b;
};

describe("circuit breaker", () => {
  test("circuit breaker checkout → payment: failures under chaos http:payment open it (fast 503s, orders compensated), then it recovers and orders are placed again", async () => {
    const product = await createProduct({ priceCents: 15_000, onHand: 20 });
    const [v] = product.variants;
    const attempt = async () => {
      // a fresh signed-in shopper per attempt keeps the place-order rate limit (per user) out of the picture
      const sub = `sys_breaker_${randomUUID()}`;
      const token = tokens.customer(sub);
      await setCart(token, [{ sku: v.sku, variantId: v.variantId, qty: 1 }]);
      const res = await checkout().post(
        "/orders",
        { customer: { email: `${sub}@system-tests.meridian.local`, name: "Breaker" }, shippingAddress: address, shippingMethod: "standard", couponCode: null },
        { token, headers: { "idempotency-key": randomUUID() } },
      );
      return Object.assign(res, { shopperToken: token });
    };

    expect((await paymentBreaker()).state).toBe("closed");
    const recovered = await withChaos("checkout-service", { target: "http:payment", fault: "fail", rate: 1, ttlSec: 120 }, async () => {
      const failures = [];
      for (let i = 0; i < 6; i++) failures.push(await attempt());
      for (const f of failures) {
        expect(f.status, f.text).toBe(503);
        expect(f.json.code).toBe("UPSTREAM_UNAVAILABLE");
      }
      const open = await paymentBreaker();
      expect(open.state).toBe("open");

      // open breaker short-circuits: the call fails fast without reaching the chaos injection point
      const fast = await attempt();
      expect(fast.status).toBe(503);
      expect(fast.json.code).toBe("UPSTREAM_UNAVAILABLE");
      expect((await paymentBreaker()).rejects).toBeGreaterThan(open.rejects);

      // every failed placement was compensated: stock released, nothing left reserved
      await waitFor(async () => (await adminStock(v.sku)).reserved === 0, "reservations released by compensation (inventory.release-reservation)", { timeoutMs: 30_000 });
      expect((await adminStock(v.sku)).available).toBe(20);

      // fault fixed: after BREAKER_RESET_MS the breaker half-opens and a successful call closes it
      await clearChaos("checkout-service", "http:payment");
      return waitFor(async () => {
        const r = await attempt();
        return r.status === 201 ? r : null;
      }, "an order to be placed again once the breaker lets a trial call through", { timeoutMs: 60_000, intervalMs: 2000 });
    });

    expect((await paymentBreaker()).state).toBe("closed");
    expect(recovered.json.payment.transactionId).toBeTruthy();
    // leave nothing unpaid behind for the expiry sweep: cancel the recovered order (releases its hold)
    const orderId = recovered.json.order.id as string;
    const cancel = await checkout().post(`/orders/${orderId}/cancel`, undefined, { token: recovered.shopperToken });
    expect(cancel.status, cancel.text).toBeLessThan(300);
    await waitFor(async () => (await adminStock(v.sku)).reserved === 0, "hold released after cancelling the recovered order");
  });
});
