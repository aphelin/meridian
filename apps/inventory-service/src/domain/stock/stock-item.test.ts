import { describe, expect, it } from "vitest";
import { OutOfStockError } from "../errors";
import { StockItem } from "./stock-item";
import { StockLines } from "./stock-lines";

const now = new Date("2026-09-17T10:00:00Z");
const item = (onHand: number, reserved = 0) => StockItem.restore({ sku: "OAK-1", onHand, reserved, updatedAt: now });

describe("StockItem", () => {
  it("opening stock for a catalog SKU is 0 when the product is sold out, else the default (amendment 1p)", () => {
    expect(StockItem.openingOnHandForCatalog(8, false)).toBe(8);
    expect(StockItem.openingOnHandForCatalog(8, true)).toBe(0);
    const opened = StockItem.create("OAK-1", StockItem.openingOnHandForCatalog(8, true), now);
    expect(opened.available).toBe(0);
  });

  it("reserve holds units and reduces available", () => {
    const stock = item(5);
    stock.reserve(2, now);
    expect([stock.onHand, stock.reserved, stock.available]).toEqual([5, 2, 3]);
    expect(stock.pullMovements()).toEqual([]);
  });

  it("reserve beyond available throws out of stock with sku and available details", () => {
    const stock = item(3, 2);
    const error = (() => {
      try {
        stock.reserve(2, now);
      } catch (e) {
        return e;
      }
    })() as OutOfStockError;
    expect(error).toBeInstanceOf(OutOfStockError);
    expect(error.code).toBe("OUT_OF_STOCK");
    expect(error.details).toEqual({ sku: "OAK-1", available: 1 });
    expect(stock.reserved).toBe(2);
  });

  it("commit decrements onHand and reserved and records a movement", () => {
    const stock = item(5, 2);
    stock.commitHold(2, "ord_1", now);
    expect([stock.onHand, stock.reserved, stock.available]).toEqual([3, 0, 3]);
    expect(stock.pullMovements()).toEqual([{ sku: "OAK-1", delta: -2, onHandAfter: 3, reason: "order-committed", actorId: null, orderId: "ord_1", occurredAt: now }]);
    expect(stock.pullEvents()).toEqual([]);
  });

  it("release of a hold returns units to available and cannot release more than reserved", () => {
    const stock = item(5, 2);
    stock.releaseHold(2, now);
    expect(stock.available).toBe(5);
    expect(() => stock.releaseHold(1, now)).toThrow(/only 0 reserved/);
  });

  it("raises StockDepleted when available goes from >0 to 0", () => {
    const stock = item(2);
    stock.reserve(1, now);
    expect(stock.pullEvents()).toEqual([]);
    stock.reserve(1, now);
    expect(stock.pullEvents().map((e) => [e.name, e.payload])).toEqual([["StockDepleted", { sku: "OAK-1" }]]);
  });

  it("raises StockReplenished when available goes from 0 to >0", () => {
    const stock = item(2, 2);
    stock.releaseHold(1, now);
    expect(stock.pullEvents().map((e) => [e.name, e.payload])).toEqual([["StockReplenished", { sku: "OAK-1", available: 1 }]]);
    stock.releaseHold(1, now);
    expect(stock.pullEvents()).toEqual([]);
  });

  it("restock increases onHand, records a movement and raises StockAdjusted", () => {
    const stock = item(0);
    stock.restock(3, "ord_9", now);
    expect(stock.onHand).toBe(3);
    expect(stock.pullMovements()).toMatchObject([{ delta: 3, onHandAfter: 3, reason: "restock", orderId: "ord_9" }]);
    const events = stock.pullEvents();
    expect(events.map((e) => e.name)).toEqual(["StockReplenished", "StockAdjusted"]);
    expect(events[1].payload).toEqual({ sku: "OAK-1", onHand: 3, reserved: 0, available: 3, previousAvailable: 0, actorId: null, reason: "restock" });
  });

  it("adjust by delta and to an absolute level records movements with the admin reason", () => {
    const stock = item(4, 1);
    expect(stock.adjust({ delta: 3 }, "cycle count", "admin-1", now)).toBe(true);
    expect(stock.adjust({ onHand: 2 }, "damaged", "admin-1", now)).toBe(true);
    expect(stock.pullMovements().map((m) => [m.delta, m.onHandAfter, m.reason, m.actorId])).toEqual([
      [3, 7, "cycle count", "admin-1"],
      [-5, 2, "damaged", "admin-1"],
    ]);
    expect(stock.pullEvents().map((e) => e.name)).toEqual(["StockAdjusted", "StockAdjusted"]);
  });

  it("adjust refuses to drop onHand below reserved or below zero", () => {
    const stock = item(4, 3);
    expect(() => stock.adjust({ onHand: 2 }, "loss", null, now)).toThrow(expect.objectContaining({ code: "CONFLICT" }));
    expect(() => stock.adjust({ delta: -10 }, "loss", null, now)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(stock.onHand).toBe(4);
  });

  it("adjust that ends on the same level is a no-op and emits a deplete event when available hits zero", () => {
    const stock = item(4, 1);
    expect(stock.adjust({ onHand: 4 }, "recount", null, now)).toBe(false);
    expect(stock.pullMovements()).toEqual([]);
    stock.adjust({ onHand: 1 }, "recount", null, now);
    expect(stock.pullEvents().map((e) => e.name)).toEqual(["StockDepleted", "StockAdjusted"]);
  });

  it("create records an initial movement only for positive opening stock", () => {
    expect(StockItem.create("NEW-1", 8, now).pullMovements()).toMatchObject([{ delta: 8, onHandAfter: 8, reason: "initial-stock" }]);
    expect(StockItem.create("NEW-2", 0, now).pullMovements()).toEqual([]);
    expect(() => StockItem.create("bad sku", 1, now)).toThrow(/Invalid SKU/);
  });
});

describe("StockLines", () => {
  it("merges duplicate SKUs and sorts lines by SKU (the lock order)", () => {
    const lines = StockLines.of([
      { sku: "B-2", qty: 1 },
      { sku: "A-1", qty: 2 },
      { sku: "B-2", qty: 3 },
    ]);
    expect(lines.toJSON()).toEqual([
      { sku: "A-1", qty: 2 },
      { sku: "B-2", qty: 4 },
    ]);
    expect(lines.equals(StockLines.of([{ sku: "A-1", qty: 2 }, { sku: "B-2", qty: 4 }]))).toBe(true);
    expect(() => StockLines.of([])).toThrow();
    expect(() => StockLines.of([{ sku: "A-1", qty: 0 }])).toThrow();
  });
});

describe("StockItem restock limits", () => {
  it("restock never pushes onHand past the maximum stock level", () => {
    const stock = StockItem.restore({ sku: "OAK-1", onHand: 999_999, reserved: 0, updatedAt: now });
    expect(() => stock.restock(2, null, now)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(stock.onHand).toBe(999_999);
  });
});
