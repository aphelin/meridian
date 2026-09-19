import type { AdminOrderListDto, CustomerRef, OrderStatus, OrderSummaryDto, Page, ReturnDto } from "@meridian/contracts";

export interface AdminOrderFilter {
  status: OrderStatus | null;
  /** Order number, or part of the customer's email or name. */
  q: string | null;
  cursor: string | null;
  limit: number;
}

export type AdminReturnDto = ReturnDto & { orderNumber: string; customer: CustomerRef };

export interface ReturnFilter {
  status: ReturnDto["status"] | null;
  cursor: string | null;
  limit: number;
}

/** Denormalised order reads for list screens (no aggregates loaded). Cursors are opaque; a malformed one is a 400. */
export abstract class OrderReadModel {
  abstract listForUser(userId: string, limit: number): Promise<OrderSummaryDto[]>;
  abstract listForAdmin(filter: AdminOrderFilter): Promise<AdminOrderListDto>;
  abstract listReturns(filter: ReturnFilter): Promise<Page<AdminReturnDto>>;
}
