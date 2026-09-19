import type { Category, Material } from "../../domain/catalog/category";
import type { ProductContentInput } from "../../domain/product/product";
import type { VariantProps } from "../../domain/product/product-variant";

export interface SeedProduct extends ProductContentInput {
  /** Stable id so re-seeding an empty database reproduces the ids consumers already know. */
  id: string;
  variants: VariantProps[];
}

export interface CatalogSeed {
  categories: Category[];
  materials: Material[];
  products: SeedProduct[];
}

/** The storefront catalog moved into the service (infrastructure/seed). */
export abstract class CatalogSeedSource {
  abstract load(): CatalogSeed;
}
