import type { ContactMessageDto, EmailDeliveryDto, Page } from "@meridian/contracts";
import { ValidationError } from "@meridian/kernel";
import { Injectable } from "@nestjs/common";
import { NotificationReadModel, type DeliveryFilter } from "../../application/ports";
import type { Prisma } from "../../generated/prisma";
import { PrismaService } from "../prisma.service";

interface Cursor {
  createdAt: Date;
  id: string;
}

/** Opaque keyset cursor over (createdAt desc, id desc): stable under concurrent inserts, unlike offsets. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString("base64url");
}

export function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as [unknown, unknown];
    const date = typeof createdAt === "string" ? new Date(createdAt) : new Date(NaN);
    if (Number.isNaN(date.getTime()) || typeof id !== "string" || id.length > 100) throw new Error("bad cursor");
    return { createdAt: date, id };
  } catch {
    throw new ValidationError("Invalid cursor", { field: "cursor" });
  }
}

const before = (cursor: Cursor | null) => (cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {});

function page<T extends { createdAt: Date; id: string }, D>(rows: T[], limit: number, map: (row: T) => D): Page<D> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items: items.map(map), nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

@Injectable()
export class PrismaNotificationReadModel extends NotificationReadModel {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listDeliveries(filter: DeliveryFilter): Promise<Page<EmailDeliveryDto>> {
    const where: Prisma.EmailDeliveryWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.template ? { template: filter.template } : {}),
      ...before(decodeCursor(filter.cursor)),
    };
    const rows = await this.prisma.emailDelivery.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: filter.limit + 1 });
    return page(rows, filter.limit, (row) => ({
      id: row.id,
      template: row.template as EmailDeliveryDto["template"],
      to: row.toEmail,
      subject: row.subject,
      status: row.status as EmailDeliveryDto["status"],
      attempts: row.attempts,
      lastError: row.lastError,
      correlationId: row.correlationId,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
    }));
  }

  async listContactMessages(filter: { cursor?: string; limit: number }): Promise<Page<ContactMessageDto>> {
    const rows = await this.prisma.contactMessage.findMany({ where: before(decodeCursor(filter.cursor)), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: filter.limit + 1 });
    return page(rows, filter.limit, (row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      topic: row.topic as ContactMessageDto["topic"],
      orderNumber: row.orderNumber,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
