import { Injectable } from "@nestjs/common";
import { Invoice, InvoiceRepository, type InvoiceStatus, type TransactionContext } from "../../domain";
import type { Invoice as InvoiceRow } from "../../generated/prisma";
import { PrismaService } from "./prisma.service";
import { dbOf } from "./prisma-unit-of-work";

@Injectable()
export class PrismaInvoiceRepository extends InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByOrderId(orderId: string, tx?: TransactionContext): Promise<Invoice | null> {
    const row = await dbOf(this.prisma, tx).invoice.findUnique({ where: { orderId } });
    return row ? toDomain(row) : null;
  }

  async nextSequence(tx: TransactionContext): Promise<number> {
    // The serial column's sequence, resolved through the connection's search_path (the service schema).
    const rows = await dbOf(this.prisma, tx).$queryRaw<{ value: bigint }[]>`SELECT nextval(pg_get_serial_sequence('"Invoice"', 'seq')) AS value`;
    return Number(rows[0].value);
  }

  async insertIfAbsent(invoice: Invoice, tx: TransactionContext): Promise<Invoice> {
    const db = dbOf(this.prisma, tx);
    const i = invoice.snapshot();
    // ON CONFLICT DO NOTHING keeps the transaction usable when a concurrent delivery allocated first.
    await db.invoice.createMany({
      data: [{ id: i.id, orderId: i.orderId, number: i.number, seq: i.sequence, status: i.status, objectKey: i.objectKey, totalCents: i.totalCents, createdAt: i.createdAt, issuedAt: i.issuedAt }],
      skipDuplicates: true,
    });
    const stored = await db.invoice.findUnique({ where: { orderId: i.orderId } });
    if (!stored) throw new Error(`invoice for order ${i.orderId} was neither inserted nor found`);
    return toDomain(stored);
  }

  async save(invoice: Invoice, tx: TransactionContext): Promise<void> {
    const i = invoice.snapshot();
    await dbOf(this.prisma, tx).invoice.update({ where: { id: i.id }, data: { status: i.status, issuedAt: i.issuedAt } });
  }
}

function toDomain(row: InvoiceRow): Invoice {
  return Invoice.restore({
    id: row.id,
    orderId: row.orderId,
    number: row.number,
    sequence: row.seq,
    status: row.status as InvoiceStatus,
    objectKey: row.objectKey,
    totalCents: row.totalCents,
    createdAt: row.createdAt,
    issuedAt: row.issuedAt,
  });
}
