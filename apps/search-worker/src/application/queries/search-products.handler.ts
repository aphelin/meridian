import type { SearchHitDto, SearchResultDto } from "@meridian/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { chooseMatchMode, didYouMeanFor, SearchCriteria, SearchCursor, sortValuesOf, type MatchMode } from "../../domain";
import { SearchReadModel, type SearchHitRow } from "../ports";
import { SearchProductsQuery } from "./search-products.query";

@QueryHandler(SearchProductsQuery)
export class SearchProductsHandler implements IQueryHandler<SearchProductsQuery, SearchResultDto> {
  constructor(private readonly readModel: SearchReadModel) {}

  async execute({ input }: SearchProductsQuery): Promise<SearchResultDto> {
    const criteria = SearchCriteria.create(input);
    const mode = await this.matchMode(criteria);
    const order = criteria.sortTerms();
    const fingerprint = criteria.cursorFingerprint(mode);
    const after = criteria.cursor ? [...SearchCursor.decode(criteria.cursor, fingerprint, order).values] : null;

    const [page, closest] = await Promise.all([
      this.readModel.search({ criteria, mode, order, after, fetch: criteria.limit + 1 }),
      mode.kind === "fuzzy" ? this.readModel.closestName(mode.text, mode.threshold) : Promise.resolve(null),
    ]);
    const hasMore = page.rows.length > criteria.limit;
    const rows = page.rows.slice(0, criteria.limit);
    const last = rows.at(-1);
    return {
      items: rows.map(toHit),
      total: page.total,
      nextCursor: hasMore && last ? SearchCursor.after(fingerprint, sortValuesOf(last, order)).encode() : null,
      facets: page.facets,
      didYouMean: didYouMeanFor(mode, closest),
    };
  }

  private async matchMode(criteria: SearchCriteria): Promise<MatchMode> {
    if (!criteria.text) return chooseMatchMode(null, false);
    return chooseMatchMode(criteria.text, await this.readModel.hasFullTextMatch(criteria.text.toTsQuery()));
  }
}

function toHit(row: SearchHitRow): SearchHitDto {
  return {
    productId: row.productId,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    categoryId: row.categoryId,
    priceCents: row.priceCents,
    heroImageUrl: row.heroImageUrl,
    inStock: row.inStock,
    featured: row.featured,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    score: Number(row.scoreKey),
  };
}
