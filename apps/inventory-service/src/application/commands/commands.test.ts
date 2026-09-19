import { beforeEach, describe, expect, it } from "vitest";
import { clock as makeClock, InMemoryReadModel, InMemoryUnitOfWork, settings } from "../../test-support/in-memory";
import { AdjustStockHandler } from "./adjust-stock.handler";
import { CommitReservationHandler } from "./commit-reservation.handler";
import { SeedStockCommand, SyncCatalogStockCommand } from "./create-stock-items.command";
import { SeedStockHandler, SyncCatalogStockHandler } from "./create-stock-items.handler";
import { ExpireReservationsHandler } from "./expire-reservations.handler";
import { AdjustStockCommand } from "./adjust-stock.command";
import { CommitReservationCommand } from "./commit-reservation.command";
import { ReleaseReservationCommand } from "./release-reservation.command";
import { ReleaseReservationHandler } from "./release-reservation.handler";
import { ReserveStockCommand } from "./reserve-stock.command";
import { ReserveStockHandler } from "./reserve-stock.handler";
import { RestockItemsCommand } from "./restock-items.command";
import { RestockItemsHandler } from "./restock-items.handler";

let uow: InMemoryUnitOfWork;
let clock: ReturnType<typeof makeClock>;
let reserve: ReserveStockHandler;
let commit: CommitReservationHandler;
let release: ReleaseReservationHandler;

beforeEach(() => {
  uow = new InMemoryUnitOfWork();
  clock = makeClock();
  reserve = new ReserveStockHandler(uow, clock, settings());
  commit = new CommitReservationHandler(uow, clock);
  release = new ReleaseReservationHandler(uow, clock);
  uow.seed("P1", 3);
  uow.seed("P2", 1);
});

const both = [
  { sku: "P2", qty: 1 },
  { sku: "P1", qty: 2 },
];

describe("reserve stock", () => {
  it("reserves every line and writes StockReserved and StockDepleted to the outbox", async () => {
    const dto = await reserve.execute(new ReserveStockCommand("ord_1", both));
    expect(dto).toEqual({ orderId: "ord_1", status: "held", lines: [{ sku: "P1", qty: 2 }, { sku: "P2", qty: 1 }], expiresAt: "2026-09-17T10:15:00.000Z" });
    expect(uow.stock("P1")).toMatchObject({ onHand: 3, reserved: 2 });
    expect(uow.stock("P2")).toMatchObject({ onHand: 1, reserved: 1 });
    expect(uow.events().map((e) => e.name)).toEqual(["StockReserved", "StockDepleted"]);
  });

  it("is all-or-nothing across lines: out of stock on one line rolls back every line", async () => {
    await reserve.execute(new ReserveStockCommand("ord_1", [{ sku: "P2", qty: 1 }]));
    const outbox = uow.events().length;
    await expect(reserve.execute(new ReserveStockCommand("ord_2", both))).rejects.toMatchObject({ code: "OUT_OF_STOCK", details: { sku: "P2", available: 0 } });
    expect(uow.stock("P1")).toMatchObject({ reserved: 0 });
    expect(uow.db.reservations.has("ord_2")).toBe(false);
    expect(uow.events()).toHaveLength(outbox);
  });

  it("is idempotent per orderId and refuses the same orderId with different lines", async () => {
    const first = await reserve.execute(new ReserveStockCommand("ord_1", both));
    const again = await reserve.execute(new ReserveStockCommand("ord_1", [...both].reverse()));
    expect(again).toEqual(first);
    expect(uow.stock("P1")).toMatchObject({ reserved: 2 });
    expect(uow.events("StockReserved")).toHaveLength(1);
    await expect(reserve.execute(new ReserveStockCommand("ord_1", [{ sku: "P1", qty: 1 }]))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("locks stock rows in sorted SKU order to avoid deadlocks", async () => {
    uow.seed("A0", 5);
    await reserve.execute(new ReserveStockCommand("ord_1", [{ sku: "P2", qty: 1 }, { sku: "A0", qty: 1 }, { sku: "P1", qty: 1 }]));
    expect(uow.lockLog.at(-1)).toEqual(["A0", "P1", "P2"]);
  });

  it("gives the last unit to exactly one of five concurrent reservations", async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => reserve.execute(new ReserveStockCommand(`ord_race_${i}`, [{ sku: "P2", qty: 1 }]))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(4);
    expect(rejected.every((r) => r.reason.code === "OUT_OF_STOCK")).toBe(true);
    expect(uow.stock("P2")).toMatchObject({ onHand: 1, reserved: 1 });
  });
});

describe("commit reservation", () => {
  it("decrements onHand and reserved, records movements and is idempotent", async () => {
    await reserve.execute(new ReserveStockCommand("ord_1", both));
    const dto = await commit.execute(new CommitReservationCommand("ord_1"));
    await commit.execute(new CommitReservationCommand("ord_1"));
    expect(dto.status).toBe("committed");
    expect(uow.stock("P1")).toMatchObject({ onHand: 1, reserved: 0 });
    expect(uow.events("StockCommitted")).toHaveLength(1);
    expect(uow.db.movements.map((m) => [m.sku, m.delta, m.reason, m.orderId])).toEqual([
      ["P1", -2, "order-committed", "ord_1"],
      ["P2", -1, "order-committed", "ord_1"],
    ]);
  });

  it("commit of a released reservation is an invalid transition and unknown orders are 404", async () => {
    await reserve.execute(new ReserveStockCommand("ord_1", both));
    await release.execute(new ReleaseReservationCommand("ord_1", "cancelled"));
    await expect(commit.execute(new CommitReservationCommand("ord_1"))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(commit.execute(new CommitReservationCommand("ord_none"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("release reservation", () => {
  it("returns stock, emits StockReservationReleased and StockReplenished, and is idempotent", async () => {
    await reserve.execute(new ReserveStockCommand("ord_1", both));
    await release.execute(new ReleaseReservationCommand("ord_1", "cancelled"));
    const again = await release.execute(new ReleaseReservationCommand("ord_1", "cancelled"));
    expect(again?.status).toBe("released");
    expect(uow.stock("P2")).toMatchObject({ onHand: 1, reserved: 0 });
    expect(uow.events("StockReservationReleased")).toHaveLength(1);
    expect(uow.events("StockReplenished").map((e) => e.payload)).toEqual([{ sku: "P2", available: 1 }]);
  });

  it("release command is inbox-idempotent per messageId and ignores unknown or committed orders", async () => {
    await reserve.execute(new ReserveStockCommand("ord_1", [{ sku: "P1", qty: 1 }]));
    await release.execute(new ReleaseReservationCommand("ord_1", "payment-failed", { messageId: "m-1", lenient: true }));
    // Re-reserve under another order, then redeliver m-1: it must not touch anything.
    await reserve.execute(new ReserveStockCommand("ord_2", [{ sku: "P1", qty: 1 }]));
    await expect(release.execute(new ReleaseReservationCommand("ord_2", "payment-failed", { messageId: "m-1", lenient: true }))).resolves.toBeNull();
    expect(uow.stock("P1")).toMatchObject({ reserved: 1 });
    await expect(release.execute(new ReleaseReservationCommand("ord_ghost", "cancelled", { messageId: "m-2", lenient: true }))).resolves.toBeNull();
    await commit.execute(new CommitReservationCommand("ord_2"));
    await expect(release.execute(new ReleaseReservationCommand("ord_2", "cancelled", { messageId: "m-3", lenient: true }))).resolves.toMatchObject({ status: "committed" });
    await expect(release.execute(new ReleaseReservationCommand("ord_2", "cancelled"))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("restock", () => {
  it("restock command is inbox-idempotent per messageId and per return", async () => {
    const restock = new RestockItemsHandler(uow, clock);
    await expect(restock.execute(new RestockItemsCommand("ord_1", "ret_1", [{ sku: "P2", qty: 2 }], "m-1"))).resolves.toEqual({ applied: true });
    await expect(restock.execute(new RestockItemsCommand("ord_1", "ret_1", [{ sku: "P2", qty: 2 }], "m-1"))).resolves.toEqual({ applied: false });
    await expect(restock.execute(new RestockItemsCommand("ord_1", "ret_1", [{ sku: "P2", qty: 2 }], "m-other"))).resolves.toEqual({ applied: false });
    await expect(restock.execute(new RestockItemsCommand("ord_1", "ret_2", [{ sku: "P2", qty: 1 }], "m-2"))).resolves.toEqual({ applied: true });
    expect(uow.stock("P2")).toMatchObject({ onHand: 4 });
    expect(uow.db.movements.filter((m) => m.reason === "restock").map((m) => m.delta)).toEqual([2, 1]);
    expect(uow.events("StockAdjusted")).toHaveLength(2);
  });

  it("restock creates a SKU that has no stock row and replenishes depleted stock", async () => {
    uow.seed("P3", 1, 1);
    const restock = new RestockItemsHandler(uow, clock);
    await restock.execute(new RestockItemsCommand("ord_1", null, [{ sku: "GONE-1", qty: 1 }, { sku: "P3", qty: 2 }], "m-1"));
    expect(uow.stock("GONE-1")).toMatchObject({ onHand: 1, reserved: 0 });
    expect(uow.events("StockReplenished").map((e) => (e.payload as { sku: string }).sku)).toEqual(["GONE-1", "P3"]);
  });
});

describe("adjust stock", () => {
  it("records a movement and emits StockAdjusted and StockDepleted", async () => {
    const adjust = new AdjustStockHandler(uow, clock);
    const dto = await adjust.execute(new AdjustStockCommand("P1", { delta: -3 }, "damaged", "admin-1"));
    expect(dto).toMatchObject({ sku: "P1", onHand: 0, reserved: 0, available: 0 });
    expect(uow.events().map((e) => e.name)).toEqual(["StockDepleted", "StockAdjusted"]);
    expect(uow.db.movements).toMatchObject([{ sku: "P1", delta: -3, reason: "damaged", actorId: "admin-1" }]);
  });

  it("creates an unknown SKU for an absolute level but 404s for a delta", async () => {
    const adjust = new AdjustStockHandler(uow, clock);
    await expect(adjust.execute(new AdjustStockCommand("NEW-1", { delta: 2 }, "count", null))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(adjust.execute(new AdjustStockCommand("NEW-1", { onHand: 2 }, "count", null))).resolves.toMatchObject({ onHand: 2 });
  });
});

describe("reservation expiry sweep", () => {
  it("releases holds past expiresAt plus grace with reason expired", async () => {
    const reads = new InMemoryReadModel(uow);
    const expire = new ExpireReservationsHandler(uow, reads, clock, settings());
    await reserve.execute(new ReserveStockCommand("ord_old", [{ sku: "P2", qty: 1 }]));
    clock.advance(900_000 + 200_000);
    await reserve.execute(new ReserveStockCommand("ord_new", [{ sku: "P1", qty: 1 }]));
    await expect(expire.execute()).resolves.toEqual({ released: 0, failed: 0 });
    clock.advance(100_000);
    await expect(expire.execute()).resolves.toEqual({ released: 1, failed: 0 });
    expect(uow.db.reservations.get("ord_old")).toMatchObject({ status: "released", releaseReason: "expired" });
    expect(uow.db.reservations.get("ord_new")).toMatchObject({ status: "held" });
    expect(uow.events("StockReservationReleased").map((e) => e.payload)).toEqual([{ orderId: "ord_old", lines: [{ sku: "P2", qty: 1 }], reason: "expired" }]);
    expect(uow.stock("P2")).toMatchObject({ reserved: 0 });
  });

  it("expiry skips holds committed after the candidates were read", async () => {
    const committedMeanwhile = new (class extends InMemoryReadModel {
      async findExpiredHolds(cutoff: Date, limit: number) {
        const ids = await super.findExpiredHolds(cutoff, limit);
        for (const id of ids) await commit.execute(new CommitReservationCommand(id));
        return ids;
      }
    })(uow);
    const expire = new ExpireReservationsHandler(uow, committedMeanwhile, clock, settings());
    await reserve.execute(new ReserveStockCommand("ord_1", [{ sku: "P1", qty: 1 }]));
    clock.advance(2_000_000);
    await expect(expire.execute()).resolves.toEqual({ released: 0, failed: 0 });
    expect(uow.db.reservations.get("ord_1")?.status).toBe("committed");
  });
});

describe("stock item creation", () => {
  it("catalog sync creates missing stock items with the default on-hand and never overwrites", async () => {
    const sync = new SyncCatalogStockHandler(uow, clock, settings({ defaultOnHand: 7 }));
    await expect(sync.execute(new SyncCatalogStockCommand(["P1", "NEW-1", "NEW-1"], "prod_1"))).resolves.toEqual({ created: 1 });
    expect(uow.stock("NEW-1")).toMatchObject({ onHand: 7, reserved: 0 });
    expect(uow.stock("P1")).toMatchObject({ onHand: 3 });
    expect(uow.db.movements).toMatchObject([{ sku: "NEW-1", delta: 7, reason: "initial-stock" }]);
  });

  it("catalog sync opens SKUs of a sold-out product at 0 and never changes existing rows (amendment 1p)", async () => {
    const sync = new SyncCatalogStockHandler(uow, clock, settings({ defaultOnHand: 7 }));
    await expect(sync.execute(new SyncCatalogStockCommand(["P1", "SOLD-1"], "prod_sold", true))).resolves.toEqual({ created: 1 });
    expect(uow.stock("SOLD-1")).toMatchObject({ onHand: 0, reserved: 0 });
    expect(uow.stock("P1")).toMatchObject({ onHand: 3 });
    expect(uow.db.movements).toEqual([]);
    await expect(sync.execute(new SyncCatalogStockCommand(["SOLD-1"], "prod_sold", false))).resolves.toEqual({ created: 0 });
    expect(uow.stock("SOLD-1")).toMatchObject({ onHand: 0 });
  });

  it("seed is idempotent", async () => {
    const seed = new SeedStockHandler(uow, clock);
    await expect(seed.execute(new SeedStockCommand([{ sku: "S-1", onHand: 4 }, { sku: "P1", onHand: 99 }]))).resolves.toEqual({ created: 1 });
    await expect(seed.execute(new SeedStockCommand([{ sku: "S-1", onHand: 5 }]))).resolves.toEqual({ created: 0 });
    expect(uow.stock("S-1")).toMatchObject({ onHand: 4 });
    expect(uow.stock("P1")).toMatchObject({ onHand: 3 });
  });
});
