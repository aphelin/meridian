import { createLogger } from "@meridian/nest-kit";
import type { PrismaClient } from "../../generated/prisma";

const log = createLogger("SearchIndexes");

/**
 * Indexes Prisma cannot declare: GIN over the tsvector and pg_trgm GIN over name and kind. pg_trgm is installed
 * once in schema `public` (infra postgres-init), and the connection's search_path is the service schema only,
 * so the operator class is schema-qualified. Idempotent; concurrent replicas racing on creation are tolerated.
 */
const STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS "ProductDocument_searchVector_idx" ON "ProductDocument" USING gin ("searchVector")`,
  `CREATE INDEX IF NOT EXISTS "ProductDocument_name_trgm_idx" ON "ProductDocument" USING gin ("name" public.gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "ProductDocument_kind_trgm_idx" ON "ProductDocument" USING gin ("kind" public.gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "ProductDocument_materials_idx" ON "ProductDocument" USING gin ("materials")`,
  `CREATE INDEX IF NOT EXISTS "ProductDocument_colors_idx" ON "ProductDocument" USING gin ("colors")`,
];

export async function installSearchIndexes(prisma: Pick<PrismaClient, "$executeRawUnsafe">): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      const code = (error as { meta?: { code?: string } }).meta?.code;
      // 23505/42P07: another replica created the same index concurrently.
      if (code === "23505" || code === "42P07") continue;
      log.error("search index creation failed", { statement, error: (error as Error).message });
      throw error;
    }
  }
}
