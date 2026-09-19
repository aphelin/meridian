import type { CatalogSnapshotDto, CategoryDto, MaterialDto, Page, ProductDto } from "@meridian/contracts";
import { parseWith, ServiceOnly } from "@meridian/nest-kit";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { SkuPriceDto } from "../../application/ports/catalog-read-model";
import { GetCatalogSnapshotQuery, GetPricesQuery, GetProductQuery, ListCategoriesQuery, ListMaterialsQuery, ListProductsQuery } from "../../application/queries/catalog.queries";
import { pricesQuerySchema, productListQuerySchema, slugSchema } from "./schemas";

/** Public catalog reads (published products only) and service-to-service pricing. */
@Controller()
export class CatalogController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("catalog/snapshot")
  snapshot(): Promise<CatalogSnapshotDto> {
    return this.queryBus.execute(new GetCatalogSnapshotQuery());
  }

  @Get("categories")
  categories(): Promise<CategoryDto[]> {
    return this.queryBus.execute(new ListCategoriesQuery());
  }

  @Get("materials")
  materials(): Promise<MaterialDto[]> {
    return this.queryBus.execute(new ListMaterialsQuery());
  }

  @Get("products")
  products(@Query() query: unknown): Promise<Page<ProductDto>> {
    const q = parseWith(productListQuerySchema, query);
    return this.queryBus.execute(new ListProductsQuery({ categoryId: q.category, featured: q.featured, cursor: q.cursor, limit: q.limit }));
  }

  @Get("products/:slug")
  product(@Param("slug") slug: string): Promise<ProductDto> {
    return this.queryBus.execute(new GetProductQuery(parseWith(slugSchema, slug)));
  }

  @Get("prices")
  @ServiceOnly()
  prices(@Query() query: unknown): Promise<SkuPriceDto[]> {
    return this.queryBus.execute(new GetPricesQuery(parseWith(pricesQuerySchema, query).skus));
  }
}
