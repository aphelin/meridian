import { ensure } from "@meridian/kernel";
import type { OrderFact, SoldLine } from "./order-facts";
import { ProjectionDelta } from "./projection-delta";
import { UtcDay } from "./utc-day";

export interface OrderActivityState {
  orderId: string;
  placedDay: string | null;
  paidDay: string | null;
  cancelledDay: string | null;
  paidCents: number;
  refundedCents: number;
  paymentFailures: number;
}

/**
 * What the projection has already counted for one order. The Inbox dedupes redeliveries of one message; this entity
 * dedupes the business fact itself, so an order is placed, paid and cancelled at most once in the statistics even
 * if its producer re-publishes a fact under a new messageId, and refunds are counted from the cumulative total.
 */
export class OrderActivity {
  private constructor(private state: OrderActivityState) {}

  static start(orderId: string): OrderActivity {
    ensure(typeof orderId === "string" && orderId.length > 0, "VALIDATION_FAILED", "orderId is required");
    return new OrderActivity({ orderId, placedDay: null, paidDay: null, cancelledDay: null, paidCents: 0, refundedCents: 0, paymentFailures: 0 });
  }

  static restore(state: OrderActivityState): OrderActivity {
    return new OrderActivity({ ...state });
  }

  get orderId(): string {
    return this.state.orderId;
  }

  snapshot(): OrderActivityState {
    return { ...this.state };
  }

  /** Folds one fact into this order and returns what the read model must add (empty when already counted). */
  apply(fact: OrderFact): ProjectionDelta {
    ensure(fact.orderId === this.state.orderId, "VALIDATION_FAILED", "fact belongs to another order");
    const day = UtcDay.of(fact.at).value;
    switch (fact.kind) {
      case "placed":
        return this.place(day, fact.totalCents);
      case "paid":
        return this.pay(day, fact.totalCents, fact.lines);
      case "cancelled":
        return this.cancel(day, fact.reason);
      case "refunded":
        return this.refund(day, fact.amountCents, fact.totalRefundedCents);
      case "payment-failed":
        this.state.paymentFailures += 1;
        return ProjectionDelta.none().addDaily(day, { paymentsFailed: 1 });
    }
  }

  private place(day: string, totalCents: number): ProjectionDelta {
    if (this.state.placedDay) return ProjectionDelta.none();
    assertCents(totalCents, "totalCents");
    this.state.placedDay = day;
    return ProjectionDelta.none().addDaily(day, { ordersPlaced: 1, placedCents: totalCents });
  }

  private pay(day: string, totalCents: number, lines: readonly SoldLine[]): ProjectionDelta {
    if (this.state.paidDay) return ProjectionDelta.none();
    assertCents(totalCents, "totalCents");
    for (const line of lines) {
      ensure(Number.isInteger(line.qty) && line.qty > 0, "VALIDATION_FAILED", `line ${line.sku} has an invalid quantity`);
      assertCents(line.lineTotalCents, "lineTotalCents");
    }
    this.state.paidDay = day;
    this.state.paidCents = totalCents;
    return ProjectionDelta.none().addDaily(day, { ordersPaid: 1, grossCents: totalCents }).addSoldLines(day, lines);
  }

  private cancel(day: string, reason: string): ProjectionDelta {
    if (this.state.cancelledDay) return ProjectionDelta.none();
    this.state.cancelledDay = day;
    return ProjectionDelta.none().addDaily(day, { ordersCancelled: 1 }).addCancellation(day, reason || "unknown");
  }

  /**
   * Refund events carry the order's cumulative refunded total, which makes them idempotent and self-healing: the
   * projection counts only what the total grew by since the last refund it saw. A malformed total falls back to
   * the refund amount.
   */
  private refund(day: string, amountCents: number, totalRefundedCents: number): ProjectionDelta {
    assertCents(amountCents, "amountCents");
    const target = Number.isSafeInteger(totalRefundedCents) && totalRefundedCents >= amountCents ? totalRefundedCents : this.state.refundedCents + amountCents;
    const increase = target - this.state.refundedCents;
    if (increase <= 0) return ProjectionDelta.none();
    this.state.refundedCents = target;
    return ProjectionDelta.none().addDaily(day, { refundsCents: increase });
  }
}

function assertCents(value: number, field: string): void {
  ensure(Number.isSafeInteger(value) && value >= 0, "VALIDATION_FAILED", `${field} must be a non-negative whole number of cents`);
}
