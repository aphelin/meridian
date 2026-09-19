import type { SearchCriteriaInput } from "../../domain";

export class SearchProductsQuery {
  constructor(readonly input: SearchCriteriaInput) {}
}
