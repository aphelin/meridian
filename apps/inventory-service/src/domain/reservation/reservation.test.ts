import { describe, expect, it } from "vitest";
import { StockItem } from "../stock/stock-item";
import { StockLines } from "../stock/stock-lines";
import { Reservation } from "./reservation";
import { StockAllocator } from "./stock-allocator";

const now = new Date("2026-09-17T10:00:00Z");
const lines = StockLines.of([
  { sku: "A-1", qty: 2 },
  { sku: "B-1", qty: 1 },
]);

describe("Reservation", () => {
  it("hold raises StockReserved with expiresAt after the hold period", () => {
    const reservation = Reservation.hold("ord_1", lines, now, 900);
    expect(reservation.status).toBe("held");
    expect(reservation.expiresAt.toISOString()).toBe("2026-09-17T10:15:00.000Z");
    expect(reservation.pullEvents()).toEqual([
      {
        name: "StockReserved",
        aggregateType: "Reservation",
        aggregateId: "ord_1",
        occurredAt: now,
        payload: { orderId: "ord_1", lines: lines.toJSON(), expiresAt: "2026-09-17T10:15:00.000Z" },
      },
    ]);
  });

  it("commit is idempotent and release after commit is an invalid transition", () => {
    const reservation = Reservation.hold("ord_1", lines, now, 900);
    reservation.pullEvents();
    expect(reservation.commit(now)).toBe(true);
    expect(reservation.commit(now)).toBe(false);
    expect(reservation.pullEvents().map((e) => e.name)).toEqual(["StockCommitted"]);
    expect(() => reservation.release("cancelled", now)).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
  });

  it("release is idempotent, keeps the reason and cannot be committed afterwards", () => {
    const reservation = Reservation.hold("ord_1", lines, now, 900);
    reservation.pullEvents();
    expect(reservation.release("payment-failed", now)).toBe(true);
    expect(reservation.release("cancelled", now)).toBe(false);
    expect(reservation.releaseReason).toBe("payment-failed");
    expect(reservation.pullEvents().map((e) => [e.name, (e.payload as { reason: string }).reason])).toEqual([["StockReservationReleased", "payment-failed"]]);
    expect(() => reservation.commit(now)).toThrow(expect.objectContaining({ code: "INVALID_TRANSITION" }));
  });

  it("isExpired only once expiresAt plus the grace period has passed", () => {
    const reservation = Reservation.hold("ord_1", lines, now, 60);
    expect(reservation.isExpired(new Date(now.getTime() + 60_000), 30)).toBe(false);
    expect(reservation.isExpired(new Date(now.getTime() + 90_000), 30)).toBe(true);
    reservation.commit(now);
    expect(reservation.isExpired(new Date(now.getTime() + 999_000), 30)).toBe(false);
  });

  it("rejects malformed order ids", () => {
    expect(() => Reservation.hold("bad id with spaces", lines, now, 60)).toThrow(/order id/);
  });
});

describe("StockAllocator", () => {
  it("is all-or-nothing: a line that is out of stock leaves every stock item untouched", () => {
    const a = StockItem.restore({ sku: "A-1", onHand: 5, reserved: 0, updatedAt: now });
    const b = StockItem.restore({ sku: "B-1", onHand: 1, reserved: 1, updatedAt: now });
    const items = new Map([
      ["A-1", a],
      ["B-1", b],
    ]);
    expect(() => StockAllocator.allocate("ord_1", lines, items, now, 900)).toThrow(expect.objectContaining({ code: "OUT_OF_STOCK", details: { sku: "B-1", available: 0 } }));
    expect(a.reserved).toBe(0);
    expect(a.peekEvents()).toEqual([]);
  });

  it("treats an unknown SKU as out of stock with zero available", () => {
    expect(() => StockAllocator.allocate("ord_1", lines, new Map(), now, 900)).toThrow(expect.objectContaining({ details: { sku: "A-1", available: 0 } }));
  });

  it("reserves every line when all are available", () => {
    const a = StockItem.restore({ sku: "A-1", onHand: 2, reserved: 0, updatedAt: now });
    const b = StockItem.restore({ sku: "B-1", onHand: 3, reserved: 0, updatedAt: now });
    const reservation = StockAllocator.allocate("ord_1", lines, new Map([["A-1", a], ["B-1", b]]), now, 900);
    expect([a.available, b.available]).toEqual([0, 2]);
    expect(reservation.lines.toJSON()).toEqual(lines.toJSON());
    expect(a.pullEvents().map((e) => e.name)).toEqual(["StockDepleted"]);
  });
});
