import type { SuggestionDto } from "@meridian/contracts";
import { ValidationError } from "@meridian/kernel";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { SearchText, TYPO_SIMILARITY_THRESHOLD } from "../../domain";
import { SearchReadModel } from "../ports";
import { MAX_SUGGESTIONS, SuggestProductsQuery } from "./suggest-products.query";

@QueryHandler(SuggestProductsQuery)
export class SuggestProductsHandler implements IQueryHandler<SuggestProductsQuery, SuggestionDto[]> {
  constructor(private readonly readModel: SearchReadModel) {}

  async execute({ q, limit }: SuggestProductsQuery): Promise<SuggestionDto[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SUGGESTIONS) throw new ValidationError(`limit must be between 1 and ${MAX_SUGGESTIONS}`);
    const text = SearchText.parse(q);
    if (!text) return [];
    const rows = await this.readModel.suggest(text.likePrefix(), text.value, TYPO_SIMILARITY_THRESHOLD, limit);
    return rows.map((row) => ({ slug: row.slug, name: row.name, kind: row.kind, heroImageUrl: row.heroImageUrl, priceCents: row.priceCents }));
  }
}
