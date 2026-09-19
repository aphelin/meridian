import type { Cents } from "../common";

export interface DailySalesDto {
  day: string;
  ordersPlaced: number;
  ordersPaid: number;
  grossCents: Cents;
  refundsCents: Cents;
}

export interface AnalyticsOverviewDto {
  days: number;
  totals: {
    ordersPlaced: number;
    ordersPaid: number;
    ordersCancelled: number;
    grossCents: Cents;
    refundsCents: Cents;
    netCents: Cents;
    averageOrderCents: Cents;
    /** Paid ÷ placed, 0–1. */
    conversionRate: number;
  };
  daily: DailySalesDto[];
  cancellations: { reason: string; count: number }[];
  /** Offset lag of the analytics-projector group, summed across partitions. */
  projectionLag: number;
  lastEventAt: string | null;
}

export interface TopProductDto {
  sku: string;
  slug: string;
  productName: string;
  units: number;
  revenueCents: Cents;
}
