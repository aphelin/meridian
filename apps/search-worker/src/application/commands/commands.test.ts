import { describe, expect, it } from "vitest";
import { meta, snapshot } from "../../test-support/fixtures";
import { FakeMaintenance, FakeReplayer, InMemorySearchDocuments, InMemorySkuAvailability } from "../../test-support/in-memory";
import { ArchiveProductCommand } from "./archive-product.command";
import { ArchiveProductHandler } from "./archive-product.handler";
import { EnsureReadModelHandler } from "./ensure-read-model.handler";
import { IndexProductCommand } from "./index-product.command";
import { IndexProductHandler } from "./index-product.handler";
import { RebuildSearchIndexCommand } from "./rebuild-search-index.command";
import { RebuildSearchIndexHandler } from "./rebuild-search-index.handler";
import { RecordStockEventCommand } from "./record-stock-event.command";
import { RecordStockEventHandler } from "./record-stock-event.handler";

describe("indexing commands", () => {
  it("indexes a published snapshot and applies a later price update", async () => {
    const docs = new InMemorySearchDocuments();
    const handler = new IndexProductHandler(docs);
    expect(await handler.execute(new IndexProductCommand(snapshot(), meta("2026-09-01T10:00:00Z")))).toBe("written");
    expect(await handler.execute(new IndexProductCommand(snapshot({ priceCents: 49_000, updatedAt: "2026-09-02T10:00:00Z" }), meta("2026-09-02T10:00:00Z")))).toBe("written");
    expect(docs.docs.get("prod_holt")!.toProps().priceCents).toBe(49_000);
  });

  it("a ProductUpdated toggling soldOut re-evaluates availability; a stale toggle is ignored (amendment 1p)", async () => {
    const docs = new InMemorySearchDocuments();
    const handler = new IndexProductHandler(docs);
    const always = () => true;
    await handler.execute(new IndexProductCommand(snapshot(), meta("2026-09-01T10:00:00Z")));
    expect(docs.docs.get("prod_holt")!.inStock(always)).toBe(true);
    expect(await handler.execute(new IndexProductCommand(snapshot({ soldOut: true, updatedAt: "2026-09-02T10:00:00Z" }), meta("2026-09-02T10:00:00Z")))).toBe("written");
    expect(docs.docs.get("prod_holt")!.inStock(always)).toBe(false);
    expect(await handler.execute(new IndexProductCommand(snapshot({ soldOut: false }), meta("2026-09-01T10:00:00Z")))).toBe("unchanged");
    expect(docs.docs.get("prod_holt")!.soldOut).toBe(true);
    expect(await handler.execute(new IndexProductCommand(snapshot({ soldOut: false, updatedAt: "2026-09-03T10:00:00Z" }), meta("2026-09-03T10:00:00Z")))).toBe("written");
    expect(docs.docs.get("prod_holt")!.inStock(always)).toBe(true);
  });

  it("ignores a replayed stale snapshot (duplicate delivery from a replay topic)", async () => {
    const docs = new InMemorySearchDocuments();
    const handler = new IndexProductHandler(docs);
    await handler.execute(new IndexProductCommand(snapshot({ priceCents: 49_000, updatedAt: "2026-09-02T10:00:00Z" }), meta("2026-09-02T10:00:00Z")));
    expect(await handler.execute(new IndexProductCommand(snapshot(), meta("2026-09-01T10:00:00Z")))).toBe("unchanged");
    expect(docs.docs.get("prod_holt")!.toProps().priceCents).toBe(49_000);
  });

  it("archives an indexed product and ignores an archive for an unknown product", async () => {
    const docs = new InMemorySearchDocuments();
    await new IndexProductHandler(docs).execute(new IndexProductCommand(snapshot(), meta("2026-09-01T10:00:00Z")));
    const archive = new ArchiveProductHandler(docs);
    expect(await archive.execute(new ArchiveProductCommand("prod_holt", meta("2026-09-02T10:00:00Z")))).toBe("written");
    expect(docs.docs.get("prod_holt")!.searchable).toBe(false);
    expect(await archive.execute(new ArchiveProductCommand("prod_missing", meta("2026-09-02T10:00:00Z")))).toBe("unchanged");
  });

  it("records stock availability from depleted and replenished events", async () => {
    const availability = new InMemorySkuAvailability();
    const handler = new RecordStockEventHandler(availability);
    await handler.execute(new RecordStockEventCommand("StockDepleted", { sku: "KILN-SMO" }, meta("2026-09-01T10:00:00Z")));
    expect(availability.skus.get("KILN-SMO")!.available).toBe(false);
    await handler.execute(new RecordStockEventCommand("StockReplenished", { sku: "KILN-SMO", available: 2 }, meta("2026-09-01T11:00:00Z")));
    expect(availability.skus.get("KILN-SMO")!.available).toBe(true);
    expect(await handler.execute(new RecordStockEventCommand("StockCommitted", { orderId: "o", lines: [{ sku: "KILN-SMO", qty: 1 }] }, meta("2026-09-01T12:00:00Z")))).toBe("unchanged");
  });
});

describe("rebuild and replay", () => {
  it("rebuild resets offsets and truncates the read model while consumers are stopped, then replays from earliest", async () => {
    const replayer = new FakeReplayer();
    const maintenance = new FakeMaintenance();
    const original = maintenance.truncate.bind(maintenance);
    maintenance.truncate = async () => {
      replayer.log.push("truncate");
      await original();
    };
    expect(await new RebuildSearchIndexHandler(replayer, maintenance).execute(new RebuildSearchIndexCommand("admin-1"))).toEqual({ status: "rebuilding" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(replayer.log).toEqual(["stop-consumers", "reset-offsets", "truncate", "start-consumers"]);
  });

  it("a rebuild while another replay is running is a conflict", async () => {
    const replayer = new FakeReplayer();
    replayer.running = true;
    await expect(new RebuildSearchIndexHandler(replayer, new FakeMaintenance()).execute(new RebuildSearchIndexCommand(null))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(replayer.replays).toBe(0);
  });

  it("startup replays an empty read model only when the group already committed offsets", async () => {
    const replayer = new FakeReplayer();
    const maintenance = new FakeMaintenance();
    const handler = new EnsureReadModelHandler(replayer, maintenance);
    expect(await handler.execute()).toBe("fresh-group");
    replayer.committed = true;
    expect(await handler.execute()).toBe("replaying");
    expect(replayer.replays).toBe(1);
    maintenance.empty = false;
    expect(await handler.execute()).toBe("populated");
    expect(replayer.replays).toBe(1);
  });
});
