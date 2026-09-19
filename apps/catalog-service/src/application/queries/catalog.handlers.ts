import type { CatalogSnapshotDto, CategoryDto, MaterialDto, Page, ProductDto } from "@meridian/contracts";
import { NotFoundError, ValidationError } from "@meridian/kernel";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { CatalogCache } from "../ports/catalog-cache";
import { CatalogReadModel, type SkuPriceDto } from "../ports/catalog-read-model";
import { decodeSeqCursor, encodeSeqCursor, pageSize } from "../services/cursor";
import {
  AdminGetProductQuery,
  AdminListProductsQuery,
  GetCatalogSnapshotQuery,
  GetPricesQuery,
  GetProductQuery,
  ListCategoriesQuery,
  ListMaterialsQuery,
  ListProductsQuery,
} from "./catalog.queries";

export const SNAPSHOT_CACHE_KEY = "snapshot";
export const SNAPSHOT_TTL_SEC = 60;
export const MAX_PRICE_SKUS = 100;

/** Everything the storefront needs to render the catalog; cache-aside in Redis for 60 s, invalidated by writes. */
@QueryHandler(GetCatalogSnapshotQuery)
export class GetCatalogSnapshotHandler implements IQueryHandler<GetCatalogSnapshotQuery, CatalogSnapshotDto> {
  constructor(
    private readonly readModel: CatalogReadModel,
    private readonly cache: CatalogCache,
  ) {}

  execute(): Promise<CatalogSnapshotDto> {
    return this.cache.readThrough(SNAPSHOT_CACHE_KEY, SNAPSHOT_TTL_SEC, () => this.readModel.snapshot());
  }
}

@QueryHandler(ListCategoriesQuery)
export class ListCategoriesHandler implements IQueryHandler<ListCategoriesQuery, CategoryDto[]> {
  constructor(private readonly readModel: CatalogReadModel) {}

  execute(): Promise<CategoryDto[]> {
    return this.readModel.categories();
  }
}

@QueryHandler(ListMaterialsQuery)
export class ListMaterialsHandler implements IQueryHandler<ListMaterialsQuery, MaterialDto[]> {
  constructor(private readonly readModel: CatalogReadModel) {}

  execute(): Promise<MaterialDto[]> {
    return this.readModel.materials();
  }
}

/** Published products in storefront order, keyset-paginated so pages never overlap or skip under inserts. */
@QueryHandler(ListProductsQuery)
export class ListProductsHandler implements IQueryHandler<ListProductsQuery, Page<ProductDto>> {
  constructor(private readonly readModel: CatalogReadModel) {}

  async execute({ filter }: ListProductsQuery): Promise<Page<ProductDto>> {
    const slice = await this.readModel.listProducts({
      statuses: ["published"],
      categoryId: filter.categoryId,
      featured: filter.featured,
      afterSeq: decodeSeqCursor(filter.cursor),
      limit: pageSize(filter.limit),
      order: "asc",
    });
    return { items: slice.items, nextCursor: encodeSeqCursor(slice.nextSeq) };
  }
}

@QueryHandler(GetProductQuery)
export class GetProductHandler implements IQueryHandler<GetProductQuery, ProductDto> {
  constructor(private readonly readModel: CatalogReadModel) {}

  async execute({ slug }: GetProductQuery): Promise<ProductDto> {
    const product = await this.readModel.productBySlug(slug);
    if (!product || product.status !== "published") throw new NotFoundError("Product not found.");
    return product;
  }
}

/** Checkout pricing by SKU (any status, so checkout can refuse unpublished lines); unknown SKUs are omitted. */
@QueryHandler(GetPricesQuery)
export class GetPricesHandler implements IQueryHandler<GetPricesQuery, SkuPriceDto[]> {
  constructor(private readonly readModel: CatalogReadModel) {}

  async execute({ skus }: GetPricesQuery): Promise<SkuPriceDto[]> {
    const unique = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
    if (unique.length > MAX_PRICE_SKUS) throw new ValidationError(`Ask for at most ${MAX_PRICE_SKUS} SKUs at once.`);
    if (!unique.length) return [];
    return this.readModel.prices(unique);
  }
}

/** Admin list: every status (or one), newest first, optional text search. */
@QueryHandler(AdminListProductsQuery)
export class AdminListProductsHandler implements IQueryHandler<AdminListProductsQuery, Page<ProductDto>> {
  constructor(private readonly readModel: CatalogReadModel) {}

  async execute({ filter }: AdminListProductsQuery): Promise<Page<ProductDto>> {
    const slice = await this.readModel.listProducts({
      statuses: filter.status ? [filter.status] : ["draft", "published", "archived"],
      q: filter.q?.trim() || undefined,
      afterSeq: decodeSeqCursor(filter.cursor),
      limit: pageSize(filter.limit, 50),
      order: "desc",
    });
    return { items: slice.items, nextCursor: encodeSeqCursor(slice.nextSeq) };
  }
}

@QueryHandler(AdminGetProductQuery)
export class AdminGetProductHandler implements IQueryHandler<AdminGetProductQuery, ProductDto> {
  constructor(private readonly readModel: CatalogReadModel) {}

  async execute({ productId }: AdminGetProductQuery): Promise<ProductDto> {
    const product = await this.readModel.productById(productId);
    if (!product) throw new NotFoundError("Product not found.");
    return product;
  }
}
