import { randomUUID } from "node:crypto";
import { StockItem, StockItemRepository } from "../../domain";
import type { Prisma } from "../../generated/prisma";

interface StockRow {
  sku: string;
  onHand: number;
  reserved: number;
  updatedAt: Date;
}

/** Transaction-bound StockItem repository. `lock` takes a FOR UPDATE row lock held until the transaction ends. */
export class PrismaStockItemRepository extends StockItemRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {
    super();
  }

  async lock(sku: string): Promise<StockItem | null> {
    const rows = await this.tx.$queryRaw<StockRow[]>`
      SELECT "sku", "onHand", "reserved", "updatedAt" FROM "StockItem" WHERE "sku" = ${sku} FOR UPDATE`;
    return rows[0] ? StockItem.restore(rows[0]) : null;
  }

  async insertIfMissing(item: StockItem): Promise<boolean> {
    const state = item.snapshot();
    const inserted = await this.tx.$executeRaw`
      INSERT INTO "StockItem" ("sku", "onHand", "reserved", "createdAt", "updatedAt")
      VALUES (${state.sku}, ${state.onHand}, ${state.reserved}, ${state.updatedAt}, ${state.updatedAt})
      ON CONFLICT ("sku") DO NOTHING`;
    const movements = item.pullMovements();
    if (inserted === 0) return false;
    await this.appendMovements(movements);
    return true;
  }

  async save(item: StockItem): Promise<void> {
    const state = item.snapshot();
    await this.tx.stockItem.update({
      where: { sku: state.sku },
      data: { onHand: state.onHand, reserved: state.reserved, updatedAt: state.updatedAt },
    });
    await this.appendMovements(item.pullMovements());
  }

  private async appendMovements(movements: ReturnType<StockItem["pullMovements"]>) {
    if (!movements.length) return;
    await this.tx.stockMovement.createMany({
      data: movements.map((m) => ({
        id: randomUUID(),
        sku: m.sku,
        delta: m.delta,
        onHandAfter: m.onHandAfter,
        reason: m.reason,
        actorId: m.actorId,
        orderId: m.orderId,
        createdAt: m.occurredAt,
      })),
    });
  }
}
