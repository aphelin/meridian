import { readFileSync } from "node:fs";
import { afterAll, describe, expect, test } from "vitest";
import { tokens } from "../support/auth";
import { stackLogPath } from "../support/env";
import { request } from "../support/http";
import { type Replica, startReplica, stopAllReplicas } from "../support/replica";
import { createProduct, groupStatus, searchHit, uid } from "../support/shop";
import { waitFor } from "../support/wait";

/** Correlation ids of Kafka records a search-worker instance handled, from its JSON log lines. */
function handledCorrelations(lines: Record<string, any>[]): Set<string> {
  return new Set(lines.filter((l) => l.msg === "message handled" && l.transport === "kafka" && String(l.group ?? "").endsWith("search-indexer")).map((l) => l.correlationId as string));
}
const jsonLines = (text: string) =>
  text.split("\n").flatMap((l) => {
    if (!l.startsWith("{")) return [];
    try {
      return [JSON.parse(l) as Record<string, any>];
    } catch {
      return [];
    }
  });

describe("consumer group scaling", () => {
  afterAll(async () => {
    await stopAllReplicas();
  });

  test("consumer group scaling: a second search-worker replica joins search-indexer, partitions are shared and every event is indexed once", async () => {
    const admin = tokens.admin();
    let replica: Replica | null = null;
    try {
      replica = await startReplica("search-worker");
      const r = replica;
      const members = async (base: string) => {
        const res = await request(base, "GET", "/admin/messaging", { token: admin });
        return (res.json?.consumerGroups ?? []).find((g: { group: string }) => g.group.endsWith(".search-indexer"))?.members as number | undefined;
      };
      await waitFor(async () => (await members(r.url)) === 2 && (await groupStatus("search", "search-indexer"))?.members === 2, "search-indexer group to rebalance to 2 members", { timeoutMs: 90_000, intervalMs: 1000 });
      const replicaGroup = (await request(r.url, "GET", "/admin/messaging", { token: admin })).json.consumerGroups.find((g: { group: string }) => g.group.endsWith(".search-indexer"));
      expect(replicaGroup.state).toBe("Stable");

      // publish products (keyed by product id, so they spread over the 3 partitions) until both members handled some
      const stackLog = stackLogPath("search-worker");
      const tag = `scale-${uid()}`;
      const products: { name: string; slug: string; correlationId: string }[] = [];
      await waitFor(
        async () => {
          const correlationId = `${tag}-${products.length}`;
          const p = await createProduct({ priceCents: 21_000 + products.length, correlationId });
          products.push({ name: p.name, slug: p.slug, correlationId });
          const ours = (set: Set<string>) => products.filter((x) => set.has(x.correlationId)).length;
          await waitFor(async () => (await searchHit(p.name, p.slug)) !== null, `product ${p.slug} indexed`, { timeoutMs: 30_000 });
          const onReplica = ours(handledCorrelations(r.logLines()));
          const onStack = ours(handledCorrelations(jsonLines(readFileSync(stackLog, "utf8"))));
          return products.length >= 3 && onReplica > 0 && onStack > 0;
        },
        "both group members to handle some of the published products",
        { timeoutMs: 120_000, intervalMs: 100 },
      );

      // every product is searchable, and each event was handled by exactly one member of the group
      for (const p of products) expect(await searchHit(p.name, p.slug)).not.toBeNull();
      const replicaSet = handledCorrelations(r.logLines());
      const stackSet = handledCorrelations(jsonLines(readFileSync(stackLog, "utf8")));
      const replicaCount = (c: string) => r.logLines().filter((l) => l.msg === "message handled" && l.correlationId === c && l.name === "ProductPublished").length;
      const stackCount = (c: string) => jsonLines(readFileSync(stackLog, "utf8")).filter((l) => l.msg === "message handled" && l.correlationId === c && l.name === "ProductPublished" && String(l.group ?? "").endsWith("search-indexer")).length;
      for (const p of products) {
        expect(replicaSet.has(p.correlationId) || stackSet.has(p.correlationId), `${p.slug} handled by a member`).toBe(true);
        expect(replicaCount(p.correlationId) + stackCount(p.correlationId), `${p.slug} ProductPublished handled once across the group`).toBe(1);
      }
    } finally {
      if (replica) {
        const exit = await replica.stop("SIGTERM", 30_000);
        expect(exit.timedOut).toBe(false);
        expect(exit.code).toBe(0);
      }
    }
    // the stack instance takes all partitions back and keeps indexing
    await waitFor(async () => (await groupStatus("search", "search-indexer"))?.members === 1, "search-indexer back to one member", { timeoutMs: 90_000, intervalMs: 1000 });
    const after = await createProduct({ priceCents: 21_999 });
    await waitFor(async () => (await searchHit(after.name, after.slug)) !== null, "indexing continues after the replica left", { timeoutMs: 60_000 });
  });
});
