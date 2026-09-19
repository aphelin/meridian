import type { AdminStockDto, PublicStockDto, StockMovementDto } from "@meridian/contracts";
import { NotFoundError } from "@meridian/kernel";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { Sku } from "../../domain";
import { InventoryReadModel } from "../ports";
import { GetPublicStockQuery, ListAdminStockQuery, ListPublicStockQuery, ListStockMovementsQuery } from "./stock.queries";

/** Public availability only: sku and available, never onHand or reserved. */
@QueryHandler(ListPublicStockQuery)
export class ListPublicStockHandler implements IQueryHandler<ListPublicStockQuery, PublicStockDto[]> {
  constructor(private readonly reads: InventoryReadModel) {}

  execute(): Promise<PublicStockDto[]> {
    return this.reads.listPublicStock();
  }
}

@QueryHandler(GetPublicStockQuery)
export class GetPublicStockHandler implements IQueryHandler<GetPublicStockQuery, PublicStockDto> {
  constructor(private readonly reads: InventoryReadModel) {}

  async execute({ sku }: GetPublicStockQuery): Promise<PublicStockDto> {
    const code = Sku.of(sku).value;
    const stock = await this.reads.findPublicStock(code);
    if (!stock) throw new NotFoundError(`No stock information for ${code}.`, { sku: code });
    return stock;
  }
}

@QueryHandler(ListAdminStockQuery)
export class ListAdminStockHandler implements IQueryHandler<ListAdminStockQuery, AdminStockDto[]> {
  constructor(private readonly reads: InventoryReadModel) {}

  execute(): Promise<AdminStockDto[]> {
    return this.reads.listAdminStock();
  }
}

@QueryHandler(ListStockMovementsQuery)
export class ListStockMovementsHandler implements IQueryHandler<ListStockMovementsQuery, StockMovementDto[]> {
  constructor(private readonly reads: InventoryReadModel) {}

  async execute({ sku, limit }: ListStockMovementsQuery): Promise<StockMovementDto[]> {
    const code = Sku.of(sku).value;
    if (!(await this.reads.stockExists(code))) throw new NotFoundError(`No stock record for ${code}.`, { sku: code });
    return this.reads.listMovements(code, Math.min(Math.max(1, limit), 500));
  }
}

export const QueryHandlers = [ListPublicStockHandler, GetPublicStockHandler, ListAdminStockHandler, ListStockMovementsHandler];
