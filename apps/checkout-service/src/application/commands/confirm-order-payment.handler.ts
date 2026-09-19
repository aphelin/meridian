import { CLOCK, type Clock, NotFoundError } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { type Order, OrderRepository } from "../../domain";
import { InventoryReservations, MessageOutbox, UnitOfWork } from "../ports";
import { retryOnConflict } from "../services";
import { ConfirmOrderPaymentCommand, type ConfirmPaymentOutcome } from "./confirm-order-payment.command";

export const CONFIRM_PAYMENT_CONSUMER = "checkout.confirm-payment";
const log = createLogger("ConfirmOrderPayment");

/**
 * Settles a successful payment, idempotently:
 *   - payable order: placed → paid with OrderPaid + `checkout.generate-invoice` (one transaction, version-guarded so
 *     it cannot interleave with expiry), then commit the stock hold over HTTP (a failure throws and RabbitMQ retries;
 *     the retry finds the order paid by this payment and only commits again, which inventory treats idempotently);
 *   - order already paid by this payment (redelivery or a duplicate message, also after a later cancellation, whose
 *     restock relies on the commit): commit stock again, nothing else;
 *   - order no longer payable (expired, cancelled, paid by another payment, wrong amount): `payment.void`.
 * The inbox mark is written last, so a message counts as processed only after every step succeeded.
 */
@CommandHandler(ConfirmOrderPaymentCommand)
export class ConfirmOrderPaymentHandler implements ICommandHandler<ConfirmOrderPaymentCommand, ConfirmPaymentOutcome> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly inventory: InventoryReservations,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ messageId, payload }: ConfirmOrderPaymentCommand): Promise<ConfirmPaymentOutcome> {
    if (await this.outbox.wasProcessed(CONFIRM_PAYMENT_CONSUMER, messageId)) return "duplicate";

    const settled = await retryOnConflict(async (): Promise<{ order: Order; outcome: "paid" | "already-paid" } | { order: Order; outcome: "void"; reason: string }> => {
      const order = await this.orders.findById(payload.orderId);
      if (!order) throw new NotFoundError(`Order ${payload.orderId} not found`, { orderId: payload.orderId });
      if (order.isPaidBy(payload.paymentId)) return { order, outcome: "already-paid" };
      const reason = this.unpayableReason(order, payload.amountCents);
      if (reason) return { order, outcome: "void", reason };
      await this.uow.run(async (tx) => {
        order.markPaid(payload, this.clock.now());
        await this.orders.save(order, tx);
        await this.outbox.events(tx, order.pullEvents());
        await this.outbox.command(tx, "checkout.generate-invoice", { orderId: order.id }, { type: "Order", id: order.id });
      });
      return { order, outcome: "paid" };
    });

    if (settled.outcome === "void") {
      const voided = await this.uow.run((tx) =>
        this.outbox.once(tx, CONFIRM_PAYMENT_CONSUMER, messageId, () =>
          this.outbox.command(tx, "payment.void", { orderId: payload.orderId, transactionId: payload.transactionId, reason: settled.reason }, { type: "Order", id: payload.orderId }),
        ),
      );
      log.warn("payment for an unpayable order voided", { orderId: payload.orderId, paymentId: payload.paymentId, reason: settled.reason });
      return voided ? "voided" : "duplicate";
    }

    // Always commit for an order this payment paid, even if it was cancelled meanwhile: cancelling a paid order sends
    // `inventory.restock` for every line, which assumes the hold was committed (inventory commits idempotently).
    await this.inventory.commit(settled.order.id);
    await this.uow.run((tx) => this.outbox.once(tx, CONFIRM_PAYMENT_CONSUMER, messageId, async () => undefined));
    if (settled.outcome === "paid") log.info("order paid", { orderId: settled.order.id, paymentId: payload.paymentId });
    return settled.outcome;
  }

  private unpayableReason(order: Order, amountCents: number): string | null {
    if (!order.isPayable()) return order.status === "cancelled" ? "order-cancelled" : `order-${order.status}`;
    if (amountCents !== order.totalCents) return "amount-mismatch";
    return null;
  }
}
