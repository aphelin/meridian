export class GetTopProductsQuery {
  constructor(
    readonly days: number,
    readonly limit: number,
  ) {}
}
