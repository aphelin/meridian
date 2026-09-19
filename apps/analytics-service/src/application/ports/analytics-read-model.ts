import type { DailySalesRow, ProductSalesRow } from "../../domain";

/** Query side of the projection; day bounds are inclusive "YYYY-MM-DD" strings. */
export abstract class AnalyticsReadModel {
  abstract dailySales(from: string, to: string): Promise<DailySalesRow[]>;
  abstract cancellations(from: string, to: string): Promise<Array<{ reason: string; count: number }>>;
  abstract productSales(from: string, to: string): Promise<ProductSalesRow[]>;
  abstract lastEventAt(consumer: string): Promise<Date | null>;
}
