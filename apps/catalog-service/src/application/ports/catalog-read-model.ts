import type { CatalogSnapshotDto, CategoryDto, MaterialDto, ProductDto, ProductStatus, ReviewDto } from "@meridian/contracts";

export interface SkuPriceDto {
  sku: string;
  slug: string;
  productName: string;
  variantLabel: string;
  variantId: string;
  priceCents: number;
  status: ProductStatus;
  /** Merchandising stop-sell (amendment 1p): checkout refuses the line when true. */
  soldOut: boolean;
}

export interface ProductListFilter {
  statuses: ProductStatus[];
  categoryId?: string;
  featured?: boolean;
  /** Case-insensitive match on name, slug, kind or SKU. */
  q?: string;
  /** Keyset position: only products after this sequence number in the list order. */
  afterSeq?: number;
  limit: number;
  order: "asc" | "desc";
}

export interface ProductListSlice {
  items: ProductDto[];
  /** Sequence number of the last item when more items follow, otherwise null. */
  nextSeq: number | null;
}

export interface ReviewPosition {
  createdAt: string;
  id: string;
}

export interface ReviewSlice {
  items: ReviewDto[];
  next: ReviewPosition | null;
}

/** Denormalised reads for HTTP queries (the CQRS read side over the catalog tables). */
export abstract class CatalogReadModel {
  abstract snapshot(): Promise<CatalogSnapshotDto>;
  abstract categories(): Promise<CategoryDto[]>;
  abstract materials(): Promise<MaterialDto[]>;
  abstract listProducts(filter: ProductListFilter): Promise<ProductListSlice>;
  abstract productBySlug(slug: string): Promise<ProductDto | null>;
  abstract productById(id: string): Promise<ProductDto | null>;
  abstract prices(skus: readonly string[]): Promise<SkuPriceDto[]>;
  abstract reviews(productId: string, after: ReviewPosition | null, limit: number): Promise<ReviewSlice>;
  abstract review(id: string): Promise<ReviewDto | null>;
  /** Wishlist slugs of products that are currently published, in the order they were added. */
  abstract wishlist(userId: string): Promise<string[]>;
}
