import type { OrderStatus } from "@meridian/contracts";

/**
 * Order state machine. Partial refunds before delivery keep the fulfilment status (refundedCents records them);
 * a full refund ends the order as `refunded`; after delivery partial refunds move it to `partially_refunded`.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  placed: ["paid", "cancelled"],
  paid: ["fulfilling", "cancelled", "refunded"],
  fulfilling: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["partially_refunded", "refunded"],
  partially_refunded: ["refunded"],
  refunded: [],
  cancelled: [],
});

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => ORDER_TRANSITIONS[from].includes(to);

/** Statuses from which the shopper or an admin may cancel. */
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = ["placed", "paid", "fulfilling"];

/** Statuses in which a return may be requested (subject to the return window). */
export const RETURNABLE_STATUSES: readonly OrderStatus[] = ["delivered", "partially_refunded"];

export const RETURN_WINDOW_DAYS = 30;
