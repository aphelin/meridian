export class ListPublicStockQuery {}

export class GetPublicStockQuery {
  constructor(readonly sku: string) {}
}

export class ListAdminStockQuery {}

export class ListStockMovementsQuery {
  constructor(
    readonly sku: string,
    readonly limit = 200,
  ) {}
}
