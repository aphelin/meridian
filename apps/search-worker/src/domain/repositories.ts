import type { SearchDocument } from "./search-document";
import type { SkuAvailability } from "./sku-availability";

export type ChangeResult = "written" | "unchanged";

/**
 * Search documents keyed by product id. `change` receives the current document (row-locked for the duration) and
 * returns the replacement, or null to keep it; the read and the write happen atomically.
 */
export abstract class SearchDocumentRepository {
  abstract change(productId: string, change: (current: SearchDocument | null) => SearchDocument | null): Promise<ChangeResult>;
}

/** Latest availability per SKU with the same atomic read-decide-write contract. */
export abstract class SkuAvailabilityRepository {
  abstract change(sku: string, change: (current: SkuAvailability | null) => SkuAvailability | null): Promise<ChangeResult>;
}
