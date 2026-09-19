import type { SoldLine } from "./order-facts";

export interface DailyIncrement {
  ordersPlaced: number;
  ordersPaid: number;
  ordersCancelled: number;
  paymentsFailed: number;
  placedCents: number;
  grossCents: number;
  refundsCents: number;
}

export interface ProductIncrement {
  day: string;
  sku: string;
  slug: string;
  productName: string;
  units: number;
  revenueCents: number;
}

export interface CancellationIncrement {
  day: string;
  reason: string;
}

const zeroDaily = (): DailyIncrement => ({ ordersPlaced: 0, ordersPaid: 0, ordersCancelled: 0, paymentsFailed: 0, placedCents: 0, grossCents: 0, refundsCents: 0 });

/**
 * The increments one fact adds to the read model. Increments are commutative and additive, so concurrent
 * projections of different orders can apply them with atomic upserts in any order.
 */
export class ProjectionDelta {
  private readonly dailyByDay = new Map<string, DailyIncrement>();
  private readonly productByKey = new Map<string, ProductIncrement>();
  private readonly cancellationList: CancellationIncrement[] = [];

  static none(): ProjectionDelta {
    return new ProjectionDelta();
  }

  addDaily(day: string, increment: Partial<DailyIncrement>): this {
    const current = this.dailyByDay.get(day) ?? zeroDaily();
    for (const [key, value] of Object.entries(increment) as [keyof DailyIncrement, number][]) current[key] += value;
    this.dailyByDay.set(day, current);
    return this;
  }

  addSoldLines(day: string, lines: readonly SoldLine[]): this {
    for (const line of lines) {
      const key = `${day}|${line.sku}`;
      const current = this.productByKey.get(key) ?? { day, sku: line.sku, slug: line.slug, productName: line.productName, units: 0, revenueCents: 0 };
      current.units += line.qty;
      current.revenueCents += line.lineTotalCents;
      this.productByKey.set(key, current);
    }
    return this;
  }

  addCancellation(day: string, reason: string): this {
    this.cancellationList.push({ day, reason });
    return this;
  }

  /** Sorted by day so every writer takes row locks in the same order. */
  daily(): Array<{ day: string } & DailyIncrement> {
    return [...this.dailyByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, increment]) => ({ day, ...increment }));
  }

  /** Sorted by (day, sku) for deterministic lock ordering. */
  products(): ProductIncrement[] {
    return [...this.productByKey.values()].sort((a, b) => a.day.localeCompare(b.day) || a.sku.localeCompare(b.sku));
  }

  cancellations(): CancellationIncrement[] {
    return [...this.cancellationList].sort((a, b) => a.day.localeCompare(b.day) || a.reason.localeCompare(b.reason));
  }

  isEmpty(): boolean {
    return this.dailyByDay.size === 0 && this.productByKey.size === 0 && this.cancellationList.length === 0;
  }
}
