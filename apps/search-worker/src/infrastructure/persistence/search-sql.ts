import { Prisma } from "../../generated/prisma";

/** Text search configuration for documents and queries (stemming + English stop words). */
export const TS_CONFIG = Prisma.raw(`'english'::regconfig`);

/**
 * Weighted document vector: A = name and kind, B = materials, variant labels and category, C = story.
 * Evaluated on write so the stored tsvector always matches the stored columns.
 */
export const SEARCH_VECTOR_SQL = Prisma.sql`
  setweight(to_tsvector(${TS_CONFIG}, coalesce("name", '') || ' ' || coalesce("kind", '')), 'A') ||
  setweight(to_tsvector(${TS_CONFIG}, array_to_string("materials", ' ') || ' ' || array_to_string("variantLabels", ' ') || ' ' || coalesce("categoryLabel", '')), 'B') ||
  setweight(to_tsvector(${TS_CONFIG}, coalesce("story", '')), 'C')`;
