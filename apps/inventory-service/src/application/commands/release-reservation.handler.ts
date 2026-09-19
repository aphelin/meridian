import type { ReservationDto } from "@meridian/contracts";
import { createLogger } from "@meridian/nest-kit";
import { CLOCK, NotFoundError, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { assertOrderId } from "../../domain";
import { toReservationDto } from "../dto";
import { UnitOfWork } from "../ports";
import { RELEASE_CONSUMER, ReleaseReservationCommand } from "./release-reservation.command";
import { releaseReservation } from "./release-support";

const log = createLogger("ReleaseReservation");

/** held → released + StockReservationReleased (+ StockReplenished). Idempotent per orderId; inbox-deduped per messageId. */
@CommandHandler(ReleaseReservationCommand)
export class ReleaseReservationHandler implements ICommandHandler<ReleaseReservationCommand, ReservationDto | null> {
  constructor(
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ orderId, reason, options }: ReleaseReservationCommand): Promise<ReservationDto | null> {
    assertOrderId(orderId);
    return this.uow.run(async (tx) => {
      if (options.messageId && !(await tx.claim(RELEASE_CONSUMER, options.messageId))) {
        log.info("duplicate release command ignored", { orderId, messageId: options.messageId });
        return null;
      }
      const reservation = await tx.reservations.lockByOrderId(orderId);
      if (!reservation) {
        if (options.lenient) {
          log.info("release for an order without a reservation ignored", { orderId });
          return null;
        }
        throw new NotFoundError(`No reservation for order ${orderId}.`, { orderId });
      }
      if (options.lenient && reservation.status === "committed") {
        log.warn("release for a committed reservation ignored", { orderId, reason });
        return toReservationDto(reservation);
      }
      await releaseReservation(tx, reservation, reason, this.clock.now());
      return toReservationDto(reservation);
    });
  }
}
