import { Injectable } from "@nestjs/common";
import { SearchIndexMaintenance, SearchReadModel, type FacetCount, type SearchHitRow, type SearchPage, type SearchPlan, type SuggestionRow } from "../../application/ports";
import { facetLabel, type FacetName, type FilterName, type MatchMode, type SearchCriteria, type SortField, type SortTerm, type SortValue } from "../../domain";
import { Prisma } from "../../generated/prisma";
import { PrismaService } from "../prisma.service";
import { TS_CONFIG } from "./search-sql";

type Sql = Prisma.Sql;

/** Upper bound for any read-model query; a slow query fails fast (500) instead of piling up connections. */
const READ_STATEMENT_TIMEOUT_MS = 5_000;

/** Column of the `flagged` CTE that carries each sort field, and how a cursor value is cast for comparison. */
const SORT_COLUMNS: Record<SortField, { column: Sql; cast: Sql }> = {
  score: { column: Prisma.raw(`"score"`), cast: Prisma.raw("numeric") },
  featured: { column: Prisma.raw(`"featured"`), cast: Prisma.raw("boolean") },
  createdAt: { column: Prisma.raw(`"productCreatedAt"`), cast: Prisma.raw("timestamptz") },
  priceCents: { column: Prisma.raw(`"priceCents"`), cast: Prisma.raw("integer") },
  name: { column: Prisma.raw(`"nameKey"`), cast: Prisma.raw("text") },
  productId: { column: Prisma.raw(`"productId"`), cast: Prisma.raw("text") },
};

const FLAG_COLUMNS: Record<FilterName, Sql> = {
  category: Prisma.raw(`"f_category"`),
  materials: Prisma.raw(`"f_materials"`),
  colors: Prisma.raw(`"f_colors"`),
  price: Prisma.raw(`"f_price"`),
  inStock: Prisma.raw(`"f_in_stock"`),
};

/**
 * Mirrors `SearchDocument.inStock` (amendment 1p): a product is in stock only when it is not flagged soldOut and any
 * variant SKU is not known to be unavailable (unknown SKUs count as available). The `inStock` filter and the
 * `inStockCount` facet both read this column, so they follow the flag too.
 */
const IN_STOCK_SQL = Prisma.sql`(NOT d."soldOut" AND EXISTS (
  SELECT 1 FROM unnest(d."skus") AS s(sku)
  LEFT JOIN "SkuAvailability" a ON a."sku" = s.sku
  WHERE a."available" IS NOT FALSE
))`;

interface FacetsRow {
  total: number;
  inStockCount: number;
  priceMin: number | null;
  priceMax: number | null;
  categories: Array<{ id: string; label: string; count: number }>;
  materials: Array<{ id: string; count: number }>;
  colors: Array<{ id: string; count: number }>;
}

/**
 * Postgres implementation of the search read model: tsvector full text with ts_rank, pg_trgm typo fallback, facet
 * counts that ignore their own filter, and keyset pagination. pg_trgm functions are schema-qualified (`public.`)
 * because the connection's search_path is only the service schema (`search` or a `search_test_*` schema).
 */
@Injectable()
export class PrismaSearchReadModel extends SearchReadModel {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hasFullTextMatch(tsquery: string): Promise<boolean> {
    const rows = await this.bounded(
      this.prisma.$queryRaw<Array<{ matched: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM "ProductDocument" d
          WHERE d."status" = 'published' AND d."searchVector" @@ to_tsquery(${TS_CONFIG}, ${tsquery})
        ) AS matched`,
    );
    return rows[0]?.matched === true;
  }

  async closestName(text: string, threshold: number): Promise<string | null> {
    const rows = await this.bounded(this.prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM (
        SELECT d."name" AS name, d."productId" AS id,
               greatest(public.similarity(d."name", ${text}), public.similarity(d."kind", ${text})) AS similarity,
               public.similarity(d."name", ${text}) AS name_similarity
        FROM "ProductDocument" d
        WHERE d."status" = 'published'
      ) candidates
      WHERE similarity >= ${threshold}
      ORDER BY similarity DESC, name_similarity DESC, lower(name), id
      LIMIT 1`);
    return rows[0]?.name ?? null;
  }

  async search(plan: SearchPlan): Promise<SearchPage> {
    const cte = this.flaggedCte(plan.criteria, plan.mode);
    const all = this.flagsFor(plan.criteria.activeFilters());
    const except = (facet: FacetName) => this.flagsFor(plan.criteria.filtersForFacet(facet));
    const itemsSql = Prisma.sql`${cte}
      SELECT "productId", "slug", "name", "kind", "categoryId", "priceCents", "heroImageUrl", "inStock", "featured",
             "ratingAvg", "ratingCount", "productCreatedAt" AS "createdAt", "score"::text AS "scoreKey", "nameKey"
      FROM flagged
      WHERE ${all} AND ${this.keyset(plan.order, plan.after)}
      ORDER BY ${this.orderBy(plan.order)}
      LIMIT ${plan.fetch}`;
    const facetsSql = Prisma.sql`${cte}
      SELECT
        (SELECT count(*)::int FROM flagged WHERE ${all}) AS "total",
        (SELECT count(*)::int FROM flagged WHERE "inStock" AND ${except("inStock")}) AS "inStockCount",
        (SELECT min("priceCents") FROM flagged WHERE ${except("price")}) AS "priceMin",
        (SELECT max("priceCents") FROM flagged WHERE ${except("price")}) AS "priceMax",
        (SELECT coalesce(json_agg(json_build_object('id', id, 'label', label, 'count', n) ORDER BY n DESC, label, id), '[]'::json)
           FROM (SELECT "categoryId" AS id, min("categoryLabel") AS label, count(*)::int AS n FROM flagged WHERE ${except("category")} GROUP BY "categoryId") c) AS "categories",
        (SELECT coalesce(json_agg(json_build_object('id', id, 'count', n) ORDER BY n DESC, id), '[]'::json)
           FROM (SELECT m AS id, count(*)::int AS n FROM flagged, unnest("materials") AS m WHERE ${except("materials")} GROUP BY m) mt) AS "materials",
        (SELECT coalesce(json_agg(json_build_object('id', id, 'count', n) ORDER BY n DESC, id), '[]'::json)
           FROM (SELECT c AS id, count(*)::int AS n FROM flagged, unnest("colors") AS c WHERE ${except("colors")} GROUP BY c) cl) AS "colors"`;

    // Items, total and facets come from one snapshot so counts never disagree with the page.
    // The fuzzy match uses the indexable pg_trgm `%` operator, whose threshold is a session setting: pin it to the
    // domain threshold for this transaction only.
    const threshold = plan.mode.kind === "fuzzy" ? plan.mode.threshold : 0.3;
    const [, rows, facetRows] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<Array<{ threshold: string; timeout: string }>>`
          SELECT set_config('pg_trgm.similarity_threshold', ${String(threshold)}, true) AS threshold,
                 set_config('statement_timeout', ${String(READ_STATEMENT_TIMEOUT_MS)}, true) AS timeout`,
        this.prisma.$queryRaw<SearchHitRow[]>(itemsSql),
        this.prisma.$queryRaw<FacetsRow[]>(facetsSql),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const facets = facetRows[0];
    return {
      rows: rows.map((row) => ({ ...row, ratingAvg: row.ratingAvg === null ? null : Number(row.ratingAvg) })),
      total: facets?.total ?? 0,
      facets: {
        categories: (facets?.categories ?? []).map((c): FacetCount => ({ id: c.id, label: c.label, count: c.count })),
        materials: (facets?.materials ?? []).map((m): FacetCount => ({ id: m.id, label: facetLabel(m.id), count: m.count })),
        colors: (facets?.colors ?? []).map((c): FacetCount => ({ id: c.id, label: facetLabel(c.id), count: c.count })),
        price: facets && facets.priceMin !== null && facets.priceMax !== null ? { minCents: facets.priceMin, maxCents: facets.priceMax } : null,
        inStockCount: facets?.inStockCount ?? 0,
      },
    };
  }

  async suggest(prefixPattern: string, text: string, threshold: number, limit: number): Promise<SuggestionRow[]> {
    return this.bounded(this.prisma.$queryRaw<SuggestionRow[]>`
      SELECT "slug", "name", "kind", "heroImageUrl", "priceCents" FROM (
        SELECT d.*,
               lower(d."name") LIKE ${prefixPattern} AS name_prefix,
               (' ' || lower(d."name") || ' ' || lower(d."kind")) LIKE ${`% ${prefixPattern}`} AS word_prefix,
               greatest(public.similarity(d."name", ${text}), public.word_similarity(${text}, d."name"), public.similarity(d."kind", ${text})) AS similarity
        FROM "ProductDocument" d
        WHERE d."status" = 'published'
      ) s
      WHERE name_prefix OR word_prefix OR similarity >= ${threshold}
      ORDER BY name_prefix DESC, word_prefix DESC, similarity DESC, "featured" DESC, lower("name"), "productId"
      LIMIT ${limit}`);
  }

  /** Runs one query in a transaction with a local statement timeout. */
  private async bounded<T>(query: Prisma.PrismaPromise<T>): Promise<T> {
    const [, result] = await this.prisma.$transaction([this.prisma.$queryRaw`SELECT set_config('statement_timeout', ${String(READ_STATEMENT_TIMEOUT_MS)}, true) AS timeout`, query]);
    return result;
  }

  /** Published products matched by text, with score and in-stock flag, then one boolean column per filter. */
  private flaggedCte(criteria: SearchCriteria, mode: MatchMode): Sql {
    const { score, match, from } = this.matchSql(mode);
    return Prisma.sql`WITH base AS MATERIALIZED (
        SELECT d."productId", d."slug", d."name", d."kind", d."categoryId", d."categoryLabel", d."materials", d."colors",
               d."priceCents", d."heroImageUrl", d."featured", d."ratingAvg", d."ratingCount", d."productCreatedAt",
               lower(d."name") AS "nameKey", ${IN_STOCK_SQL} AS "inStock", ${score} AS "score"
        FROM "ProductDocument" d ${from}
        WHERE d."status" = 'published' AND ${match}
      ), flagged AS MATERIALIZED (
        SELECT base.*,
               ${criteria.category === null ? Prisma.sql`TRUE` : Prisma.sql`"categoryId" = ${criteria.category}`} AS "f_category",
               ${criteria.materials.length ? Prisma.sql`"materials" && ${[...criteria.materials]}::text[]` : Prisma.sql`TRUE`} AS "f_materials",
               ${criteria.colors.length ? Prisma.sql`"colors" && ${[...criteria.colors]}::text[]` : Prisma.sql`TRUE`} AS "f_colors",
               (${criteria.minPriceCents === null ? Prisma.sql`TRUE` : Prisma.sql`"priceCents" >= ${criteria.minPriceCents}`}
                AND ${criteria.maxPriceCents === null ? Prisma.sql`TRUE` : Prisma.sql`"priceCents" <= ${criteria.maxPriceCents}`}) AS "f_price",
               ${criteria.inStockOnly ? Prisma.sql`"inStock"` : Prisma.sql`TRUE`} AS "f_in_stock"
        FROM base
      )`;
  }

  private matchSql(mode: MatchMode): { score: Sql; match: Sql; from: Sql } {
    switch (mode.kind) {
      case "browse":
        return { score: Prisma.sql`0::numeric`, match: Prisma.sql`TRUE`, from: Prisma.empty };
      case "full-text":
        return {
          // ts_rank normalisation 32 maps the rank into 0..1; rounding makes cursor comparisons exact.
          score: Prisma.sql`round(ts_rank(d."searchVector", q.query, 32)::numeric, 6)`,
          match: Prisma.sql`d."searchVector" @@ q.query`,
          from: Prisma.sql`, (SELECT to_tsquery(${TS_CONFIG}, ${mode.tsquery}) AS query) q`,
        };
      case "fuzzy": {
        const similarity = Prisma.sql`greatest(public.similarity(d."name", ${mode.text}), public.similarity(d."kind", ${mode.text}))`;
        // `%` narrows candidates through the trigram GIN indexes; the explicit similarity check keeps the rule exact.
        const candidates = Prisma.sql`(d."name" OPERATOR(public.%) ${mode.text} OR d."kind" OPERATOR(public.%) ${mode.text})`;
        return { score: Prisma.sql`round(${similarity}::numeric, 6)`, match: Prisma.sql`${candidates} AND ${similarity} >= ${mode.threshold}`, from: Prisma.empty };
      }
    }
  }

  private flagsFor(filters: readonly FilterName[]): Sql {
    if (!filters.length) return Prisma.sql`TRUE`;
    return Prisma.join(
      filters.map((name) => FLAG_COLUMNS[name]),
      " AND ",
    );
  }

  private orderBy(order: readonly SortTerm[]): Sql {
    return Prisma.join(
      order.map(({ field, direction }) => Prisma.sql`${SORT_COLUMNS[field].column} ${Prisma.raw(direction === "asc" ? "ASC" : "DESC")}`),
      ", ",
    );
  }

  /** Rows strictly after the cursor position in the (mixed-direction) sort order. */
  private keyset(order: readonly SortTerm[], after: readonly SortValue[] | null): Sql {
    if (!after) return Prisma.sql`TRUE`;
    const value = (index: number) => Prisma.sql`${after[index]}::${SORT_COLUMNS[order[index]!.field].cast}`;
    const branches = order.map((term, index) => {
      const equalities = order.slice(0, index).map((previous, j) => Prisma.sql`${SORT_COLUMNS[previous.field].column} = ${value(j)}`);
      const comparison = Prisma.sql`${SORT_COLUMNS[term.field].column} ${Prisma.raw(term.direction === "asc" ? ">" : "<")} ${value(index)}`;
      return Prisma.sql`(${Prisma.join([...equalities, comparison], " AND ")})`;
    });
    return Prisma.sql`(${Prisma.join(branches, " OR ")})`;
  }
}

@Injectable()
export class PrismaSearchIndexMaintenance extends SearchIndexMaintenance {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isEmpty(): Promise<boolean> {
    const [documents, availability] = await Promise.all([this.prisma.productDocument.count(), this.prisma.skuAvailability.count()]);
    return documents === 0 && availability === 0;
  }

  async truncate(): Promise<void> {
    await this.prisma.$executeRaw`TRUNCATE TABLE "ProductDocument", "SkuAvailability"`;
  }
}
