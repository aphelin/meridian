import type { SearchResultDto, SuggestionDto } from "@meridian/contracts";
import { parseWith } from "@meridian/nest-kit";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { SearchProductsQuery, SuggestProductsQuery } from "../../application/queries";
import { searchQuerySchema, suggestQuerySchema } from "./schemas";

/** Public storefront search: read-only, served from the Postgres read model. */
@Controller("search")
export class SearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("products")
  products(@Query() query: unknown): Promise<SearchResultDto> {
    const params = parseWith(searchQuerySchema, query);
    return this.queryBus.execute(
      new SearchProductsQuery({
        q: params.q,
        category: params.category,
        materials: params.materials,
        colors: params.colors,
        minPriceCents: params.minPriceCents,
        maxPriceCents: params.maxPriceCents,
        inStock: params.inStock,
        sort: params.sort,
        limit: params.limit,
        cursor: params.cursor,
      }),
    );
  }

  @Get("suggest")
  suggest(@Query() query: unknown): Promise<SuggestionDto[]> {
    const { q, limit } = parseWith(suggestQuerySchema, query);
    return this.queryBus.execute(new SuggestProductsQuery(q, limit));
  }
}
