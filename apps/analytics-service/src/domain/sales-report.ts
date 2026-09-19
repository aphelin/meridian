import { Money } from "@meridian/kernel";

export interface DailySalesRow {
  day: string;
  ordersPlaced: number;
  ordersPaid: number;
  ordersCancelled: number;
  grossCents: number;
  refundsCents: number;
}

export interface SalesTotals {
  ordersPlaced: number;
  ordersPaid: number;
  ordersCancelled: number;
  grossCents: number;
  refundsCents: number;
  netCents: number;
  averageOrderCents: number;
  conversionRate: number;
}

/**
 * Domain service for the sales KPIs. gross = paid order totals; net = gross − refunds;
 * average order = gross ÷ paid orders (rounded to the cent); conversion = paid ÷ placed (0 when nothing was placed).
 */
export const SalesReport = {
  totals(rows: readonly DailySalesRow[]): SalesTotals {
    let ordersPlaced = 0;
    let ordersPaid = 0;
    let ordersCancelled = 0;
    let gross = Money.zero();
    let refunds = Money.zero();
    for (const row of rows) {
      ordersPlaced += row.ordersPlaced;
      ordersPaid += row.ordersPaid;
      ordersCancelled += row.ordersCancelled;
      gross = gross.add(Money.cents(row.grossCents));
      refunds = refunds.add(Money.cents(row.refundsCents));
    }
    return {
      ordersPlaced,
      ordersPaid,
      ordersCancelled,
      grossCents: gross.cents,
      refundsCents: refunds.cents,
      netCents: gross.subtract(refunds).cents,
      averageOrderCents: SalesReport.averageOrderCents(gross.cents, ordersPaid),
      conversionRate: SalesReport.conversionRate(ordersPaid, ordersPlaced),
    };
  },

  averageOrderCents(grossCents: number, paidOrders: number): number {
    return paidOrders > 0 ? Math.round(grossCents / paidOrders) : 0;
  },

  /** Paid ÷ placed, clamped to 0–1 (an order paid in the window may have been placed before it). */
  conversionRate(paid: number, placed: number): number {
    if (placed <= 0) return 0;
    return Math.min(1, paid / placed);
  },

  /** One row per day of `days` (chronological), zero-filled where nothing happened. */
  fillDays(days: readonly string[], rows: readonly DailySalesRow[]): DailySalesRow[] {
    const byDay = new Map(rows.map((row) => [row.day, row] as const));
    return days.map((day) => byDay.get(day) ?? { day, ordersPlaced: 0, ordersPaid: 0, ordersCancelled: 0, grossCents: 0, refundsCents: 0 });
  },

  cancellationsByReason(rows: ReadonlyArray<{ reason: string; count: number }>): Array<{ reason: string; count: number }> {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.reason, (counts.get(row.reason) ?? 0) + row.count);
    return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  },
};
