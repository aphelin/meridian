import type { Transaction } from "../shared/transaction";
import type { Product } from "./product";

export interface LoadOptions {
  /** Lock the product row until the transaction ends (serialises concurrent writers of one product). */
  forUpdate?: boolean;
}

export abstract class ProductRepository {
  abstract findById(id: string, tx?: Transaction, options?: LoadOptions): Promise<Product | null>;
  abstract findBySlug(slug: string, tx?: Transaction, options?: LoadOptions): Promise<Product | null>;
  /** Id of the product that currently uses `slug`, if any. */
  abstract slugOwner(slug: string, tx?: Transaction): Promise<string | null>;
  /** SKU → id of the product that currently owns it, for the given SKUs. */
  abstract skuOwners(skus: readonly string[], tx?: Transaction): Promise<Map<string, string>>;
  /** The subset of `slugs` that belong to published products. */
  abstract publishedSlugs(slugs: readonly string[], tx?: Transaction): Promise<Set<string>>;
  /** Ids of published products in a category (to refresh their snapshots when the category changes). */
  abstract publishedIdsInCategory(categoryId: string, tx?: Transaction): Promise<string[]>;
  /** Serialises catalog-wide maintenance (seeding) across replicas for the rest of the transaction. */
  abstract lockCatalog(tx: Transaction): Promise<void>;
  abstract save(product: Product, tx: Transaction): Promise<void>;
}
