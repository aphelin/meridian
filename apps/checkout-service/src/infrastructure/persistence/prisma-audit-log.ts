import { Injectable } from "@nestjs/common";
import { type AuditAction, type AuditEntry, AuditLog, type AuditSubject, type TransactionContext } from "../../domain";
import type { Prisma } from "../../generated/prisma";
import { PrismaService } from "./prisma.service";
import { dbOf } from "./prisma-unit-of-work";

export const ORDER_AUDIT_LIMIT = 500;

@Injectable()
export class PrismaAuditLog extends AuditLog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async append(entry: AuditEntry, tx: TransactionContext): Promise<void> {
    await dbOf(this.prisma, tx).auditEntry.create({
      data: {
        id: entry.id,
        action: entry.action,
        actorId: entry.actorId,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        orderId: entry.orderId,
        at: entry.at,
        meta: entry.meta as Prisma.InputJsonValue,
      },
    });
  }

  async forOrder(orderId: string): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditEntry.findMany({ where: { orderId }, orderBy: [{ at: "asc" }, { id: "asc" }], take: ORDER_AUDIT_LIMIT });
    return rows.map((row) => ({
      id: row.id,
      action: row.action as AuditAction,
      actorId: row.actorId,
      subjectType: row.subjectType as AuditSubject,
      subjectId: row.subjectId,
      orderId: row.orderId,
      at: row.at,
      meta: (row.meta ?? {}) as Record<string, unknown>,
    }));
  }
}
