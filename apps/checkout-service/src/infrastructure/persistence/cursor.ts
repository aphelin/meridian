import { ValidationError } from "@meridian/kernel";

/** Keyset position for newest-first lists: (createdAt, id) of the last item on the previous page. */
export interface KeysetCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString("base64url");
}

export function decodeCursor(raw: string | null): KeysetCursor | null {
  if (!raw) return null;
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown[];
    const date = typeof createdAt === "string" ? new Date(createdAt) : null;
    if (date && !Number.isNaN(date.getTime()) && typeof id === "string" && id.length > 0 && id.length <= 64) return { createdAt: date, id };
  } catch {
    // fall through
  }
  throw new ValidationError("Invalid cursor.", { cursor: raw });
}

/** Prisma `where` fragment selecting rows strictly after the cursor in (createdAt desc, id desc) order. */
export function afterCursor(cursor: KeysetCursor | null) {
  if (!cursor) return {};
  return { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] };
}
