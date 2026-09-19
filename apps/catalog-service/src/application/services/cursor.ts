import { ValidationError } from "@meridian/kernel";
import type { ReviewPosition } from "../ports/catalog-read-model";

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(cursor: string): unknown {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError("Invalid cursor.");
  }
}

export function encodeSeqCursor(seq: number | null): string | null {
  return seq === null ? null : encode({ s: seq });
}

export function decodeSeqCursor(cursor: string | null | undefined): number | undefined {
  if (!cursor) return undefined;
  const value = decode(cursor) as { s?: unknown } | null;
  if (!value || typeof value.s !== "number" || !Number.isSafeInteger(value.s) || value.s < 0) throw new ValidationError("Invalid cursor.");
  return value.s;
}

export function encodeReviewCursor(position: ReviewPosition | null): string | null {
  return position === null ? null : encode({ c: position.createdAt, i: position.id });
}

export function decodeReviewCursor(cursor: string | null | undefined): ReviewPosition | null {
  if (!cursor) return null;
  const value = decode(cursor) as { c?: unknown; i?: unknown } | null;
  if (!value || typeof value.c !== "string" || Number.isNaN(Date.parse(value.c)) || typeof value.i !== "string" || value.i.length > 64) throw new ValidationError("Invalid cursor.");
  return { createdAt: value.c, id: value.i };
}

export function pageSize(limit: number | undefined, fallback = DEFAULT_PAGE_SIZE, max = MAX_PAGE_SIZE): number {
  if (limit === undefined) return fallback;
  if (!Number.isInteger(limit) || limit < 1) throw new ValidationError("limit must be a positive whole number.");
  return Math.min(limit, max);
}
