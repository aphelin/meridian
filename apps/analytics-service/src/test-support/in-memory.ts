import type {
  AnalyticsReadModel,
  ProjectionTransaction,
  ProjectionUnitOfWork,
  ProjectorControl,
} from "../application/ports";
import {
  OrderActivity,
  type DailySalesRow,
  type OrderActivityState,
  type ProductSalesRow,
  type ProjectionDelta,
} from "../domain";

interface DailyRecord extends DailySalesRow {
  paymentsFailed: number;
  placedCents: number;
}

/** In-memory read model + inbox with transactional semantics (work runs on copies, committed only on success). */
export class InMemoryAnalyticsStore
  implements ProjectionUnitOfWork, AnalyticsReadModel
{
  inbox = new Set<string>();
  orders = new Map<string, OrderActivityState>();
  daily = new Map<string, DailyRecord>();
  products = new Map<string, ProductSalesRow & { day: string }>();
  cancellationRows = new Map<
    string,
    { day: string; reason: string; count: number }
  >();
  lastEvent = new Map<string, Date>();
  truncations = 0;
  failNextWork: Error | null = null;

  async once(
    consumer: string,
    messageId: string,
    work: (tx: ProjectionTransaction) => Promise<void>,
  ): Promise<boolean> {
    const key = `${consumer}|${messageId}`;
    if (this.inbox.has(key)) return false;
    const draft = this.clone();
    const tx: ProjectionTransaction = {
      lockOrder: async (orderId) =>
        OrderActivity.restore(
          draft.orders.get(orderId) ?? OrderActivity.start(orderId).snapshot(),
        ),
      saveOrder: async (activity) =>
        void draft.orders.set(activity.orderId, activity.snapshot()),
      applyDelta: async (delta: ProjectionDelta) => {
        for (const d of delta.daily()) {
          const row = draft.daily.get(d.day) ?? {
            day: d.day,
            ordersPlaced: 0,
            ordersPaid: 0,
            ordersCancelled: 0,
            paymentsFailed: 0,
            placedCents: 0,
            grossCents: 0,
            refundsCents: 0,
          };
          row.ordersPlaced += d.ordersPlaced;
          row.ordersPaid += d.ordersPaid;
          row.ordersCancelled += d.ordersCancelled;
          row.paymentsFailed += d.paymentsFailed;
          row.placedCents += d.placedCents;
          row.grossCents += d.grossCents;
          row.refundsCents += d.refundsCents;
          draft.daily.set(d.day, row);
        }
        for (const p of delta.products()) {
          const k = `${p.day}|${p.sku}`;
          const row = draft.products.get(k) ?? {
            ...p,
            units: 0,
            revenueCents: 0,
          };
          row.units += p.units;
          row.revenueCents += p.revenueCents;
          draft.products.set(k, row);
        }
        for (const c of delta.cancellations()) {
          const k = `${c.day}|${c.reason}`;
          const row = draft.cancellationRows.get(k) ?? { ...c, count: 0 };
          row.count += 1;
          draft.cancellationRows.set(k, row);
        }
      },
      recordEvent: async (occurredAt) => {
        const current = draft.lastEvent.get(consumer);
        if (!current || occurredAt > current)
          draft.lastEvent.set(consumer, occurredAt);
      },
    };
    await work(tx);
    if (this.failNextWork) {
      const error = this.failNextWork;
      this.failNextWork = null;
      throw error;
    }
    Object.assign(this, draft);
    this.inbox.add(key);
    return true;
  }

  async truncate(consumer: string): Promise<void> {
    this.truncations += 1;
    this.orders.clear();
    this.daily.clear();
    this.products.clear();
    this.cancellationRows.clear();
    this.lastEvent.clear();
    for (const key of [...this.inbox])
      if (key.startsWith(`${consumer}|`)) this.inbox.delete(key);
  }

  async dailySales(from: string, to: string): Promise<DailySalesRow[]> {
    return [...this.daily.values()]
      .filter((r) => r.day >= from && r.day <= to)
      .sort((a, b) => a.day.localeCompare(b.day));
  }

  async cancellations(from: string, to: string) {
    return [...this.cancellationRows.values()]
      .filter((r) => r.day >= from && r.day <= to)
      .map(({ reason, count }) => ({ reason, count }));
  }

  async productSales(from: string, to: string): Promise<ProductSalesRow[]> {
    return [...this.products.values()].filter(
      (r) => r.day >= from && r.day <= to,
    );
  }

  async lastEventAt(consumer: string): Promise<Date | null> {
    return this.lastEvent.get(consumer) ?? null;
  }

  private clone() {
    return {
      orders: new Map([...this.orders].map(([k, v]) => [k, { ...v }])),
      daily: new Map([...this.daily].map(([k, v]) => [k, { ...v }])),
      products: new Map([...this.products].map(([k, v]) => [k, { ...v }])),
      cancellationRows: new Map(
        [...this.cancellationRows].map(([k, v]) => [k, { ...v }]),
      ),
      lastEvent: new Map(this.lastEvent),
    };
  }
}

/** Records the call order; can simulate a failing step. */
export class FakeProjectorControl implements ProjectorControl {
  calls: string[] = [];
  currentLag: number | null = 0;
  failOn: "pause" | "resetToEarliest" | null = null;
  gate: Promise<void> | null = null;

  async pause() {
    this.calls.push("pause");
    if (this.gate) await this.gate;
    if (this.failOn === "pause") throw new Error("pause failed");
  }
  async resetToEarliest() {
    this.calls.push("reset");
    if (this.failOn === "resetToEarliest")
      throw new Error("group still active");
  }
  async resume() {
    this.calls.push("resume");
  }
  async lag() {
    return this.currentLag;
  }
}
