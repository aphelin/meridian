import type { ReservationDto } from "@meridian/contracts";
import { CLOCK, NotFoundError, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { assertOrderId } from "../../domain";
import { toReservationDto } from "../dto";
import { UnitOfWork } from "../ports";
import { CommitReservationCommand } from "./commit-reservation.command";
import { lockStock, requireLocked, saveAll } from "./stock-locking";

/** held → committed: onHand and reserved drop per line (movements recorded) + StockCommitted. Idempotent. */
@CommandHandler(CommitReservationCommand)
export class CommitReservationHandler implements ICommandHandler<CommitReservationCommand, ReservationDto> {
  constructor(
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ orderId }: CommitReservationCommand): Promise<ReservationDto> {
    assertOrderId(orderId);
    return this.uow.run(async (tx) => {
      const reservation = await tx.reservations.lockByOrderId(orderId);
      if (!reservation) throw new NotFoundError(`No reservation for order ${orderId}.`, { orderId });
      const now = this.clock.now();
      if (!reservation.commit(now)) return toReservationDto(reservation);
      const items = await lockStock(tx, reservation.lines);
      for (const line of reservation.lines.items) requireLocked(items, line.sku).commitHold(line.qty, orderId, now);
      const stockEvents = await saveAll(tx, items);
      await tx.reservations.save(reservation);
      await tx.publish([...reservation.pullEvents(), ...stockEvents]);
      return toReservationDto(reservation);
    });
  }
}
