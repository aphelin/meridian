export const DEFAULT_SUGGESTIONS = 8;
export const MAX_SUGGESTIONS = 20;

export class SuggestProductsQuery {
  constructor(
    readonly q: string,
    readonly limit: number = DEFAULT_SUGGESTIONS,
  ) {}
}
