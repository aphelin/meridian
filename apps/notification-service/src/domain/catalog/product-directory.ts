import { productNameFromSlug } from "../order/order-email-policy";

/**
 * Catalog product directory (amendment 1o): what the notification context knows about a product so shopper emails can
 * say "Holt sofa" instead of "holt-sofa". A read model fed by ProductPublished / ProductUpdated / ProductArchived.
 *
 * Ordering: every entry carries `versionAt` (the snapshot `updatedAt`, or the archive time). A change older than the
 * stored version never regresses the entry, so replays and out-of-order redeliveries are harmless.
 */
export interface ProductDirectoryEntry {
  productId: string;
  slug: string;
  /** Null only for a product we have seen archived but never published (its name is still unknown). */
  name: string | null;
  heroImageUrl: string | null;
  archived: boolean;
  versionAt: Date;
}

/** A full product snapshot from ProductPublished / ProductUpdated. */
export interface ProductSnapshotChange {
  kind: "snapshot";
  productId: string;
  slug: string;
  name: string;
  heroImageUrl: string | null;
  archived: boolean;
  versionAt: Date;
}

/** ProductArchived: carries no snapshot, so it only flips the archived flag. */
export interface ProductArchivedChange {
  kind: "archived";
  productId: string;
  slug: string;
  versionAt: Date;
}

export type ProductDirectoryChange = ProductSnapshotChange | ProductArchivedChange;

/**
 * Applies a catalog change to the current entry. Returns the new entry, or null when nothing changes
 * (older or identical version).
 * - Snapshot newer than the entry: replaces it (including the archived flag, so a re-published product comes back).
 * - Snapshot not newer, but the entry has no name yet (archive seen first): fills name and image, keeps the newer
 *   archived state and version.
 * - Archive at or after the entry version: marks it archived (an archive stamped with the same instant as the last
 *   snapshot wins, since the catalog stamps both with the same clock reading).
 */
export function applyProductChange(current: ProductDirectoryEntry | null, change: ProductDirectoryChange): ProductDirectoryEntry | null {
  if (change.kind === "snapshot") {
    const next: ProductDirectoryEntry = { productId: change.productId, slug: change.slug, name: change.name, heroImageUrl: change.heroImageUrl, archived: change.archived, versionAt: change.versionAt };
    if (!current || change.versionAt.getTime() > current.versionAt.getTime()) return next;
    if (current.name === null) return { ...current, name: change.name, heroImageUrl: change.heroImageUrl };
    return null;
  }
  if (!current) return { productId: change.productId, slug: change.slug, name: null, heroImageUrl: null, archived: true, versionAt: change.versionAt };
  const at = change.versionAt.getTime();
  const stored = current.versionAt.getTime();
  if (at < stored || (at === stored && current.archived)) return null;
  return { ...current, archived: true, versionAt: change.versionAt };
}

/** The name an email shows: the catalog name when known, otherwise a readable form of the slug. */
export function displayProductName(entry: ProductDirectoryEntry | null, slug: string): string {
  return entry?.name ?? productNameFromSlug(slug);
}

/** Persistence port for the product directory, bound to one unit of work. */
export abstract class ProductDirectoryRepository {
  /** Loads the entry and serialises concurrent writers for the same product until the transaction ends. */
  abstract lock(productId: string): Promise<ProductDirectoryEntry | null>;
  abstract save(entry: ProductDirectoryEntry): Promise<void>;
  /** The entry currently holding the slug (a live product wins over an archived one, newest first). */
  abstract findBySlug(slug: string): Promise<ProductDirectoryEntry | null>;
}
