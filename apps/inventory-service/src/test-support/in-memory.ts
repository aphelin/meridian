import type { AdminStockDto, PublicStockDto, StockMovementDto } from "@meridian/contracts";
import { FixedClock } from "@meridian/kernel";
import type { InventorySettings, InventoryTransaction } from "../application/ports";
import { InventoryReadModel, UnitOfWork } from "../application/ports";
import {
  Reservation,
  ReservationRepository,
  StockItem,
  StockItemRepository,
  type InventoryEvent,
  type ReservationState,
  type StockItemState,
  type StockMovement,
} from "../domain";

interface Db {
  stock: Map<string, StockItemState>;
  reservations: Map<string, ReservationState>;
  movements: StockMovement[];
  outbox: InventoryEvent[];
  inbox: Set<string>;
}

const clone = (db: Db): Db => ({
  stock: new Map([...db.stock].map(([k, v]) => [k, { ...v }])),
  reservations: new Map([...db.reservations].map(([k, v]) => [k, { ...v, lines: v.lines.map((l) => ({ ...l })) }])),
  movements: [...db.movements],
  outbox: [...db.outbox],
  inbox: new Set(db.inbox),
});

/**
 * In-memory unit of work: each run works on a copy that replaces the committed state only on success (rollback on
 * throw). Runs are serialised, like transactions contending for the same row locks.
 */
export class InMemoryUnitOfWork extends UnitOfWork {
  db: Db = { stock: new Map(), reservations: new Map(), movements: [], outbox: [], inbox: new Set() };
  /** SKUs locked per transaction, in lock order. */
  lockLog: string[][] = [];
  private queue: Promise<unknown> = Promise.resolve();

  seed(sku: string, onHand: number, reserved = 0, updatedAt = new Date("2026-01-01T00:00:00Z")) {
    this.db.stock.set(sku, { sku, onHand, reserved, updatedAt });
  }

  stock(sku: string) {
    return this.db.stock.get(sku);
  }

  events(name?: string) {
    return this.db.outbox.filter((e) => !name || e.name === name);
  }

  run<T>(work: (tx: InventoryTransaction) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const draft = clone(this.db);
      const locks: string[] = [];
      this.lockLog.push(locks);
      const result = await work(this.bind(draft, locks));
      this.db = draft;
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private bind(db: Db, locks: string[]): InventoryTransaction {
    class Stock extends StockItemRepository {
      async lock(sku: string) {
        locks.push(sku);
        const state = db.stock.get(sku);
        return state ? StockItem.restore({ ...state }) : null;
      }
      async insertIfMissing(item: StockItem) {
        const movements = item.pullMovements();
        if (db.stock.has(item.sku)) return false;
        db.stock.set(item.sku, item.snapshot());
        db.movements.push(...movements);
        return true;
      }
      async save(item: StockItem) {
        db.stock.set(item.sku, item.snapshot());
        db.movements.push(...item.pullMovements());
      }
    }
    class Reservations extends ReservationRepository {
      async lockByOrderId(orderId: string) {
        const state = db.reservations.get(orderId);
        return state ? Reservation.restore({ ...state }) : null;
      }
      async save(reservation: Reservation) {
        db.reservations.set(reservation.orderId, reservation.snapshot());
      }
    }
    return {
      stock: new Stock(),
      reservations: new Reservations(),
      async publish(events) {
        db.outbox.push(...events);
      },
      async claim(consumer, messageId) {
        const key = `${consumer}|${messageId}`;
        if (db.inbox.has(key)) return false;
        db.inbox.add(key);
        return true;
      },
    };
  }
}

export class InMemoryReadModel extends InventoryReadModel {
  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
  }

  async listPublicStock(): Promise<PublicStockDto[]> {
    return [...this.uow.db.stock.values()].map((s) => ({ sku: s.sku, available: s.onHand - s.reserved }));
  }

  async findPublicStock(sku: string) {
    const s = this.uow.db.stock.get(sku);
    return s ? { sku: s.sku, available: s.onHand - s.reserved } : null;
  }

  async listAdminStock(): Promise<AdminStockDto[]> {
    return [...this.uow.db.stock.values()].map((s) => ({ ...s, available: s.onHand - s.reserved, updatedAt: s.updatedAt.toISOString() }));
  }

  async stockExists(sku: string) {
    return this.uow.db.stock.has(sku);
  }

  async listMovements(sku: string, limit: number): Promise<StockMovementDto[]> {
    return this.uow.db.movements
      .filter((m) => m.sku === sku)
      .reverse()
      .slice(0, limit)
      .map((m, i) => ({ id: String(i), sku: m.sku, delta: m.delta, onHandAfter: m.onHandAfter, reason: m.reason, actorId: m.actorId, orderId: m.orderId, createdAt: m.occurredAt.toISOString() }));
  }

  async findExpiredHolds(cutoff: Date, limit: number) {
    return [...this.uow.db.reservations.values()]
      .filter((r) => r.status === "held" && r.expiresAt.getTime() <= cutoff.getTime())
      .slice(0, limit)
      .map((r) => r.orderId);
  }
}

export const settings = (overrides: Partial<InventorySettings> = {}): InventorySettings => ({
  holdSeconds: 900,
  graceSeconds: 300,
  sweepMs: 60_000,
  sweepBatch: 100,
  defaultOnHand: 8,
  ...overrides,
});

export const clock = () => new FixedClock(new Date("2026-09-17T10:00:00Z"));
