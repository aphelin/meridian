import type { ReservationDto } from "@meridian/contracts";
import { CLOCK, ConflictError, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { assertOrderId, StockAllocator, StockLines } from "../../domain";
import { toReservationDto } from "../dto";
import { INVENTORY_SETTINGS, UnitOfWork, type InventorySettings } from "../ports";
import { ReserveStockCommand } from "./reserve-stock.command";
import { lockStock, saveAll } from "./stock-locking";

/**
 * All-or-nothing reservation in one transaction: order lock → stock row locks in SKU order → check every line →
 * hold every line → Reservation + StockReserved (+ StockDepleted) in the outbox. Idempotent per orderId.
 */
@CommandHandler(ReserveStockCommand)
export class ReserveStockHandler implements ICommandHandler<ReserveStockCommand, ReservationDto> {
  constructor(
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(INVENTORY_SETTINGS) private readonly settings: InventorySettings,
  ) {}

  async execute({ orderId, lines: input }: ReserveStockCommand): Promise<ReservationDto> {
    assertOrderId(orderId);
    const lines = StockLines.of(input);
    return this.uow.run(async (tx) => {
      const existing = await tx.reservations.lockByOrderId(orderId);
      if (existing) {
        if (!existing.lines.equals(lines)) throw new ConflictError(`Order ${orderId} already has a reservation with different lines.`, { orderId, status: existing.status });
        return toReservationDto(existing);
      }
      const now = this.clock.now();
      const items = await lockStock(tx, lines);
      const reservation = StockAllocator.allocate(orderId, lines, items, now, this.settings.holdSeconds);
      const stockEvents = await saveAll(tx, items);
      await tx.reservations.save(reservation);
      await tx.publish([...reservation.pullEvents(), ...stockEvents]);
      return toReservationDto(reservation);
    });
  }
}
