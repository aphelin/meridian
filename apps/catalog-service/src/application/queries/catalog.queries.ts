import type { CatalogSnapshotDto, CategoryDto, MaterialDto, Page, ProductDto, ProductStatus } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";
import type { SkuPriceDto } from "../ports/catalog-read-model";

export class GetCatalogSnapshotQuery extends Query<CatalogSnapshotDto> {}

export class ListCategoriesQuery extends Query<CategoryDto[]> {}

export class ListMaterialsQuery extends Query<MaterialDto[]> {}

export class ListProductsQuery extends Query<Page<ProductDto>> {
  constructor(readonly filter: { categoryId?: string; featured?: boolean; cursor?: string; limit?: number }) {
    super();
  }
}

export class GetProductQuery extends Query<ProductDto> {
  constructor(readonly slug: string) {
    super();
  }
}

export class GetPricesQuery extends Query<SkuPriceDto[]> {
  constructor(readonly skus: string[]) {
    super();
  }
}

export class AdminListProductsQuery extends Query<Page<ProductDto>> {
  constructor(readonly filter: { status?: ProductStatus; q?: string; cursor?: string; limit?: number }) {
    super();
  }
}

export class AdminGetProductQuery extends Query<ProductDto> {
  constructor(readonly productId: string) {
    super();
  }
}
