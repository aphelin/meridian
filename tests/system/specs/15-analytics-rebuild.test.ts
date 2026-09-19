import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { tokens } from "../support/auth";
import { stackLogPath } from "../support/env";
import { analytics } from "../support/http";
import { analyticsOverview, createProduct, groupStatus, paidOrder, rankingPriceCents, registerUser, topProducts } from "../support/shop";
import { waitFor } from "../support/wait";

const logMessages = (msg: string) =>
  readFileSync(stackLogPath("analytics-service"), "utf8")
    .split("\n")
    .filter((l) => l.startsWith("{") && l.includes(msg))
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as { msg: string; correlationId?: string; time: string }];
      } catch {
        return [];
      }
    })
    .filter((l) => l.msg === msg);

/** Overview and top products once the projector has no lag and two consecutive reads agree. */
async function settledProjection() {
  let previous = "";
  return waitFor(
    async () => {
      const group = await groupStatus("analytics", "analytics-projector");
      if (group?.lag !== 0) return null;
      const overview = await analyticsOverview();
      const top = await topProducts(30, 50);
      const snapshot = JSON.stringify({ totals: overview.totals, daily: overview.daily, cancellations: overview.cancellations, top });
      const stable = snapshot === previous;
      previous = snapshot;
      return stable && overview.projectionLag === 0 ? { overview, top, snapshot } : null;
    },
    "a settled analytics projection",
    { timeoutMs: 60_000, intervalMs: 1500 },
  );
}

describe("analytics projections", () => {
  test("analytics projection rebuild replays the Kafka log and reproduces the same totals, daily rows, cancellations and top products", async () => {
    // make sure the projection has something of this run in it
    const price = rankingPriceCents(1);
    const product = await createProduct({ priceCents: price, onHand: 3 });
    const user = await registerUser("analytics", { verify: false });
    const [v] = product.variants;
    await paidOrder({ token: user.accessToken, email: user.email, name: user.name }, [{ sku: v.sku, variantId: v.variantId, qty: 2 }]);
    await waitFor(async () => (await topProducts(30, 50)).find((p) => p.slug === product.slug)?.units === 2, "order projected into top products", { timeoutMs: 60_000 });

    const before = await settledProjection();
    expect(before.overview.totals.ordersPaid).toBeGreaterThanOrEqual(1);
    expect(before.overview.totals.netCents).toBe(before.overview.totals.grossCents - before.overview.totals.refundsCents);

    const startedBefore = logMessages("analytics-projector offsets reset to earliest").length;
    expect((await analytics().post("/admin/analytics/rebuild", undefined, { token: tokens.customer() })).status).toBe(403);
    const rebuild = await analytics().post("/admin/analytics/rebuild", undefined, { token: tokens.admin() });
    expect(rebuild.status, rebuild.text).toBe(202);

    // the rebuild really ran: offsets were reset to earliest after this request, then the log was replayed
    await waitFor(() => logMessages("analytics-projector offsets reset to earliest").length > startedBefore, "analytics-projector offsets reset to earliest (stack log)", { timeoutMs: 60_000 });
    const after = await settledProjection();
    expect(after.overview.totals).toEqual(before.overview.totals);
    expect(after.overview.daily).toEqual(before.overview.daily);
    expect(after.overview.cancellations).toEqual(before.overview.cancellations);
    expect(after.top).toEqual(before.top);
    expect(after.top.find((p) => p.slug === product.slug)).toMatchObject({ units: 2, revenueCents: price * 2, sku: v.sku });
  });
});
