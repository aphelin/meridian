import { createLogger } from "@meridian/nest-kit";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { INVENTORY_SETTINGS, InventoryReadModel, UnitOfWork, type InventorySettings } from "../ports";
import { ExpireReservationsCommand, type ExpireReservationsResult } from "./expire-reservations.command";
import { releaseReservation } from "./release-support";

const log = createLogger("ReservationExpiry");

/**
 * Safety net for abandoned checkouts: releases holds older than expiresAt + grace with reason "expired". Each order is
 * released in its own transaction and re-checked under its lock, so a concurrent commit or another replica's sweep wins
 * cleanly and one bad order never blocks the rest.
 */
@CommandHandler(ExpireReservationsCommand)
export class ExpireReservationsHandler implements ICommandHandler<ExpireReservationsCommand, ExpireReservationsResult> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly reads: InventoryReadModel,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(INVENTORY_SETTINGS) private readonly settings: InventorySettings,
  ) {}

  async execute(): Promise<ExpireReservationsResult> {
    const cutoff = new Date(this.clock.now().getTime() - this.settings.graceSeconds * 1000);
    const candidates = await this.reads.findExpiredHolds(cutoff, this.settings.sweepBatch);
    let released = 0;
    let failed = 0;
    for (const orderId of candidates) {
      try {
        const done = await this.uow.run(async (tx) => {
          const reservation = await tx.reservations.lockByOrderId(orderId);
          const now = this.clock.now();
          if (!reservation?.isExpired(now, this.settings.graceSeconds)) return false;
          return releaseReservation(tx, reservation, "expired", now);
        });
        if (done) released += 1;
      } catch (error) {
        failed += 1;
        log.error("expiring reservation failed", { orderId, error });
      }
    }
    if (released || failed) log.info("expired reservations released", { released, failed });
    return { released, failed };
  }
}
