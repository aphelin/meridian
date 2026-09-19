import { isPermanentError } from "@meridian/nest-kit";
import type { EventEnvelope } from "@meridian/contracts";
import { describe, expect, it } from "vitest";
import { snapshot } from "../../test-support/fixtures";
import { SearchIndexerConsumer } from "./search-indexer.consumer";

const envelope = (name: string, payload: unknown, over: Partial<EventEnvelope> = {}): EventEnvelope =>
  ({ messageId: "m1", kind: "event", name, version: 1, occurredAt: "2026-09-01T10:00:00Z", producer: "catalog-service", correlationId: "c1", causationId: null, aggregateType: "Product", aggregateId: "p", payload, ...over }) as EventEnvelope;

function consumer() {
  const executed: unknown[] = [];
  const bus = { execute: async (command: unknown) => void executed.push(command) };
  return { executed, consumer: new SearchIndexerConsumer(bus as never) };
}

describe("search-indexer consumer", () => {
  it("dispatches a product snapshot and a stock availability event", async () => {
    const { executed, consumer: c } = consumer();
    await c.onProductSnapshot(envelope("ProductPublished", { product: snapshot() }));
    await c.onStockEvent(envelope("StockDepleted", { sku: "HOLT-OAT" }));
    expect(executed.map((command) => (command as object).constructor.name)).toEqual(["IndexProductCommand", "RecordStockEventCommand"]);
  });

  it("passes the soldOut flag through and defaults it to false for pre-amendment snapshots (amendment 1p)", async () => {
    const { executed, consumer: c } = consumer();
    await c.onProductSnapshot(envelope("ProductUpdated", { product: snapshot({ soldOut: true }), changed: ["soldOut"] }));
    const { soldOut: _omit, ...legacy } = snapshot();
    await c.onProductSnapshot(envelope("ProductPublished", { product: legacy }));
    expect(executed.map((command) => (command as { snapshot: { soldOut: boolean } }).snapshot.soldOut)).toEqual([true, false]);
  });

  it("a poison event (payload breaking the contract) fails permanently so it is parked on the DLT", async () => {
    const { consumer: c } = consumer();
    const error = await c.onProductSnapshot(envelope("ProductPublished", { product: { slug: "broken" } })).catch((e: unknown) => e);
    expect(isPermanentError(error)).toBe(true);
  });

  it("an envelope without a usable occurredAt is permanent too", async () => {
    const { consumer: c } = consumer();
    const error = await c.onStockEvent(envelope("StockDepleted", { sku: "A" }, { occurredAt: "yesterday" })).catch((e: unknown) => e);
    expect(isPermanentError(error)).toBe(true);
  });
});
