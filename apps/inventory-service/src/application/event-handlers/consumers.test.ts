import type { CommandEnvelope, EventEnvelope } from "@meridian/contracts";
import { isPermanentError } from "@meridian/nest-kit";
import { NotFoundError } from "@meridian/kernel";
import { describe, expect, it, vi } from "vitest";
import { ReleaseReservationCommand, RestockItemsCommand, SyncCatalogStockCommand } from "../commands";
import { CatalogSyncConsumer } from "./catalog-sync.consumer";
import { InventoryCommandConsumers } from "./inventory-command.consumers";

const envelope = (name: string, payload: unknown, messageId = "m-1") =>
  ({ messageId, kind: "command", name, version: 1, occurredAt: "", producer: "t", correlationId: "c", causationId: null, aggregateType: null, aggregateId: null, payload }) as never;

describe("message consumers", () => {
  it("dispatches release-reservation with the messageId for inbox dedupe", async () => {
    const bus = { execute: vi.fn().mockResolvedValue(null) };
    await new InventoryCommandConsumers(bus as never).releaseReservation(envelope("inventory.release-reservation", { orderId: "ord_1", reason: "cancelled" }) as CommandEnvelope);
    expect(bus.execute).toHaveBeenCalledWith(new ReleaseReservationCommand("ord_1", "cancelled", { messageId: "m-1", lenient: true }));
  });

  it("an invalid restock payload is a permanent error (DLQ, no retries)", async () => {
    const bus = { execute: vi.fn() };
    const consumers = new InventoryCommandConsumers(bus as never);
    const error = await consumers.restock(envelope("inventory.restock", { orderId: "ord_1", lines: [] }) as CommandEnvelope).catch((e) => e);
    expect(isPermanentError(error)).toBe(true);
    expect(bus.execute).not.toHaveBeenCalled();
  });

  it("restock rule violations are permanent, infrastructure errors are retried", async () => {
    const payload = { orderId: "ord_1", returnId: "ret_1", lines: [{ sku: "P1", qty: 1 }] };
    const failing = new InventoryCommandConsumers({ execute: vi.fn().mockRejectedValue(new NotFoundError("x")) } as never);
    expect(isPermanentError(await failing.restock(envelope("inventory.restock", payload) as CommandEnvelope).catch((e) => e))).toBe(true);
    const flaky = new InventoryCommandConsumers({ execute: vi.fn().mockRejectedValue(new Error("db down")) } as never);
    expect(isPermanentError(await flaky.restock(envelope("inventory.restock", payload) as CommandEnvelope).catch((e) => e))).toBe(false);
    const bus = { execute: vi.fn().mockResolvedValue({ applied: true }) };
    await new InventoryCommandConsumers(bus as never).restock(envelope("inventory.restock", payload, "m-9") as CommandEnvelope);
    expect(bus.execute).toHaveBeenCalledWith(new RestockItemsCommand("ord_1", "ret_1", [{ sku: "P1", qty: 1 }], "m-9"));
  });

  it("catalog sync dispatches the valid variant SKUs of a published product", async () => {
    const bus = { execute: vi.fn().mockResolvedValue({ created: 1 }) };
    const product = { productId: "prod_1", variants: [{ sku: "OAK-1" }, { sku: "bad sku" }] };
    await new CatalogSyncConsumer(bus as never).onProduct(envelope("ProductPublished", { product }) as EventEnvelope);
    expect(bus.execute).toHaveBeenCalledWith(new SyncCatalogStockCommand(["OAK-1"], "prod_1", false));
  });

  it("catalog sync passes the soldOut flag of the product snapshot (amendment 1p)", async () => {
    const bus = { execute: vi.fn().mockResolvedValue({ created: 1 }) };
    const product = { productId: "prod_2", soldOut: true, variants: [{ sku: "KILN-1" }] };
    await new CatalogSyncConsumer(bus as never).onProduct(envelope("ProductPublished", { product }) as EventEnvelope);
    expect(bus.execute).toHaveBeenCalledWith(new SyncCatalogStockCommand(["KILN-1"], "prod_2", true));
  });
});
