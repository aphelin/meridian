import { Reservation, ReservationRepository, type ReleaseReason, type ReservationStatus } from "../../domain";
import type { Prisma } from "../../generated/prisma";

/** Transaction-bound Reservation repository. */
export class PrismaReservationRepository extends ReservationRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {
    super();
  }

  async lockByOrderId(orderId: string): Promise<Reservation | null> {
    // Transaction-scoped advisory lock on the order: taken before any StockItem row lock by every writer.
    await this.tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`reservation:${orderId}`}, 0))`;
    const row = await this.tx.reservation.findUnique({ where: { orderId }, include: { lines: { orderBy: { sku: "asc" } } } });
    if (!row) return null;
    return Reservation.restore({
      orderId: row.orderId,
      status: row.status as ReservationStatus,
      lines: row.lines.map((line) => ({ sku: line.sku, qty: line.qty })),
      expiresAt: row.expiresAt,
      releaseReason: (row.releaseReason as ReleaseReason | null) ?? null,
    });
  }

  async save(reservation: Reservation): Promise<void> {
    const state = reservation.snapshot();
    await this.tx.reservation.upsert({
      where: { orderId: state.orderId },
      create: {
        orderId: state.orderId,
        status: state.status,
        expiresAt: state.expiresAt,
        releaseReason: state.releaseReason,
        lines: { create: state.lines.map((line) => ({ sku: line.sku, qty: line.qty })) },
      },
      update: { status: state.status, releaseReason: state.releaseReason },
    });
  }
}
