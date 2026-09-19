import type { CancellationReason, CommandPayloads } from "@meridian/contracts";
import { Injectable } from "@nestjs/common";
import { CouponRepository, OrderRepository } from "../../domain";
import { MessageOutbox, UnitOfWork } from "../ports";
import { retryOnConflict } from "./retry";

type ReleaseReason = CommandPayloads["inventory.release-reservation"]["reason"];

/**
 * Cancels an order that was never paid (saga compensation and expiry): OrderCancelled, the coupon redemption given
 * back, optionally `inventory.release-reservation`, and `payment.void` when a provider transaction was already opened,
 * all in one transaction.
 */
@Injectable()
export class OrderCancellation {
  constructor(
    private readonly orders: OrderRepository,
    private readonly coupons: CouponRepository,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
  ) {}

  /** Returns false when the order is gone or no longer unpaid (e.g. paid meanwhile). */
  cancelUnpaid(orderId: string, reason: CancellationReason, release: ReleaseReason | null, now: Date): Promise<boolean> {
    return retryOnConflict(() =>
      this.uow.run(async (tx) => {
        const order = await this.orders.findById(orderId, tx);
        if (!order || !order.isPayable()) return false;
        order.cancel(reason, now);
        await this.orders.save(order, tx);
        await this.coupons.releaseRedemption(order.id, tx);
        await this.outbox.events(tx, order.pullEvents());
        if (release) await this.outbox.command(tx, "inventory.release-reservation", { orderId: order.id, reason: release }, { type: "Order", id: order.id });
        // Cancel any open provider transaction (a Stripe PaymentIntent) so the closed order can no longer be paid.
        const { transactionId } = order.payment;
        if (transactionId) await this.outbox.command(tx, "payment.void", { orderId: order.id, transactionId, reason: `Order cancelled (${reason}) before payment` }, { type: "Order", id: order.id });
        return true;
      }),
    );
  }
}
