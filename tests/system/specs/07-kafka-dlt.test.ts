import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tokens } from "../support/auth";
import { clearChaos, withChaos } from "../support/chaos";
import { catalog, inventory, newCorrelationId, search } from "../support/http";
import { type KafkaTap, kafkaTap } from "../support/kafka";
import { createProduct, groupStatus, searchHit } from "../support/shop";
import { holdsFor, waitFor } from "../support/wait";

describe("Kafka dead letters", () => {
  let tap: KafkaTap;
  beforeAll(async () => {
    tap = await kafkaTap(["meridian.catalog", "meridian.dlt.search-indexer", "meridian.replay.search-indexer"]);
  });
  afterAll(async () => {
    await tap?.stop();
  });

  test("Kafka DLT and kafka replay for one group only: search-indexer failures park on its DLT while inventory-catalog-sync keeps consuming; replay reaches only search-indexer", async () => {
    const admin = tokens.admin();
    const correlationId = newCorrelationId("dlt");
    const product = await withChaos("search-worker", { target: "handler:kafka:search-indexer", fault: "fail", rate: 1, ttlSec: 120 }, async () => {
      const p = await createProduct({ priceCents: 45_000, correlationId });
      // the other consumer group on the same topic is unaffected: inventory already created the stock row (createProduct waited for it)
      expect((await inventory().get(`/stock/${p.variants[0].sku}`)).json).toMatchObject({ sku: p.variants[0].sku, available: 8 });

      // search-indexer retried in process, then parked the event on meridian.dlt.search-indexer
      const published = await tap.find("ProductPublished", (e, r) => r.topic.endsWith(".meridian.catalog") && e.payload.product.slug === p.slug, "ProductPublished on the catalog topic");
      expect(published.envelope!.correlationId).toBe(correlationId);
      const dlt = await tap.find("ProductPublished", (e, r) => r.topic.endsWith(".meridian.dlt.search-indexer") && e.messageId === published.envelope!.messageId, "the event on the search-indexer DLT");
      expect(Number(dlt.headers["x-attempts"])).toBe(4);
      expect(dlt.headers["x-consumer-group"]).toMatch(/search-indexer$/);
      expect(await searchHit(p.name, p.slug)).toBeNull();

      const group = await groupStatus("search", "search-indexer");
      expect(group?.dlt.messages).toBeGreaterThanOrEqual(1);
      const inventoryGroup = await groupStatus("inventory", "inventory-catalog-sync");
      expect(inventoryGroup?.dlt.topic).toMatch(/meridian\.dlt\.inventory-catalog-sync$/);

      // clear the fault and prove the group consumes healthy events again (a canary product gets indexed)
      await clearChaos("search-worker", "handler:kafka:search-indexer");
      await waitFor(async () => {
        const canary = await createProduct({ priceCents: 45_500 });
        return waitFor(async () => (await searchHit(canary.name, canary.slug)) !== null, "canary indexed", { timeoutMs: 10_000 }).catch(() => false);
      }, "a canary product indexed after the fault cleared", { timeoutMs: 60_000, intervalMs: 100 });
      return { ...p, messageId: published.envelope!.messageId as string, deadLetterId: `k-${dlt.partition}-${dlt.offset}-${dlt.timestamp}` };
    });

    // replay the dead letters of this request (the product event plus any stock event it caused), by id
    const dltTopic = `${process.env.MESSAGING_NAMESPACE}.meridian.dlt.search-indexer`;
    const ours = await waitFor(async () => {
      const r = await search().get(`/admin/messaging/dead-letters?source=kafka&queueOrTopic=${encodeURIComponent(dltTopic)}&limit=500`, { token: admin });
      const list = r.status === 200 ? (r.json as any[]).filter((d) => d.correlationId === correlationId) : [];
      return list.some((d) => d.messageId === product.messageId) ? list : null;
    }, "dead letter listing on search-worker");
    const entry = ours.find((d) => d.messageId === product.messageId);
    expect(entry).toMatchObject({ id: product.deadLetterId, source: "kafka", queueOrTopic: dltTopic, name: "ProductPublished", correlationId, attempts: 4 });
    const replay = await search().post("/admin/messaging/replay", { source: "kafka", queueOrTopic: dltTopic, ids: ours.map((d) => d.id) }, { token: admin });
    expect(replay.status, replay.text).toBeLessThan(300);
    expect(replay.json.replayed).toBe(ours.length);

    await waitFor(async () => (await searchHit(product.name, product.slug))?.inStock === true, "replayed event indexed by search-indexer", { timeoutMs: 60_000 });
    // the replay went to the group's own replay topic, never back onto the shared catalog topic other groups read
    const replayed = await tap.find(null, (e, r) => r.topic.endsWith(".meridian.replay.search-indexer") && e.messageId === product.messageId, "the event on meridian.replay.search-indexer");
    expect(replayed.envelope!.correlationId).toBe(correlationId);
    await holdsFor(async () => tap.count((r) => r.topic.endsWith(".meridian.catalog") && r.envelope?.messageId === product.messageId) === 1, "the catalog topic to still hold the event exactly once", { windowMs: 2000 });

    // the product document is correct after replay and the other group did not re-create anything
    const hit = await searchHit(product.name, product.slug);
    expect(hit).toMatchObject({ slug: product.slug, priceCents: 45_000 });
    expect((await catalog().get(`/products/${product.slug}`)).status).toBe(200);
    expect((await inventory().get(`/stock/${product.variants[0].sku}`)).json.available).toBe(8);
    // replayed dead letters disappear from the listing and cannot be replayed twice
    const after = await search().get(`/admin/messaging/dead-letters?source=kafka&queueOrTopic=${encodeURIComponent(dltTopic)}&limit=500`, { token: admin });
    expect((after.json as any[]).some((d) => d.correlationId === correlationId)).toBe(false);
    const again = await search().post("/admin/messaging/replay", { source: "kafka", queueOrTopic: dltTopic, ids: [entry.id] }, { token: admin });
    expect(again.json?.replayed ?? 0).toBe(0);
  });
});
