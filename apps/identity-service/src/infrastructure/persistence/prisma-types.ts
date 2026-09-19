import type { Prisma, PrismaClient } from "../../generated/prisma";

/** Either the root client or the interactive transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}
