import { describe, expect, it } from "vitest";
import { meta } from "../test-support/fixtures";
import { productInStock, SkuAvailability } from "./sku-availability";

const at = meta("2026-09-01T10:00:00Z");

describe("SKU availability (stock read model)", () => {
  it("StockDepleted marks a SKU unavailable and StockReplenished available again", () => {
    expect(SkuAvailability.fromStockEvent("StockDepleted", { sku: "KILN-SMO" }, at)!.available).toBe(false);
    expect(SkuAvailability.fromStockEvent("StockReplenished", { sku: "KILN-SMO", available: 2 }, at)!.available).toBe(true);
  });

  it("StockAdjusted states availability from its available count", () => {
    const base = { sku: "A", onHand: 0, reserved: 0, previousAvailable: 3, actorId: null, reason: "count" };
    expect(SkuAvailability.fromStockEvent("StockAdjusted", { ...base, available: 0 }, at)!.available).toBe(false);
    expect(SkuAvailability.fromStockEvent("StockAdjusted", { ...base, available: 4 }, at)!.available).toBe(true);
  });

  it("reservation events carry no availability and change nothing", () => {
    expect(SkuAvailability.fromStockEvent("StockReserved", { orderId: "o1", lines: [{ sku: "A", qty: 1 }], expiresAt: "2026-09-01T10:15:00Z" }, at)).toBeNull();
    expect(SkuAvailability.fromStockEvent("StockCommitted", { orderId: "o1", lines: [{ sku: "A", qty: 1 }] }, at)).toBeNull();
  });

  it("an older stock event does not override a newer one", () => {
    const newer = SkuAvailability.fromStockEvent("StockReplenished", { sku: "A", available: 1 }, meta("2026-09-02T00:00:00Z"))!;
    const older = SkuAvailability.fromStockEvent("StockDepleted", { sku: "A" }, meta("2026-09-01T00:00:00Z"))!;
    expect(older.supersedes(newer)).toBe(false);
    expect(newer.supersedes(older)).toBe(true);
  });

  it("a product is in stock when any variant is, and unknown SKUs count as in stock", () => {
    expect(productInStock(["HOLT-OAT", "HOLT-CHA"], new Map([["HOLT-OAT", false]]))).toBe(true);
    expect(productInStock(["KILN-SMO"], new Map([["KILN-SMO", false]]))).toBe(false);
    expect(productInStock(["NEW-SKU"], new Map())).toBe(true);
    expect(productInStock([], new Map())).toBe(false);
  });
});
