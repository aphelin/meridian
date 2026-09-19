import type { ProductSnapshot, ProductStatus } from "@meridian/contracts";
import { ValidationError } from "@meridian/kernel";
import type { EventMeta } from "./event-meta";

export interface SearchDocumentProps {
  productId: string;
  slug: string;
  name: string;
  kind: string;
  story: string;
  categoryId: string;
  categoryLabel: string;
  materials: string[];
  colors: string[];
  skus: string[];
  variantLabels: string[];
  priceCents: number;
  featured: boolean;
  /** Catalog stop-sell flag (amendment 1p). */
  soldOut: boolean;
  heroImageUrl: string;
  ratingAvg: number | null;
  ratingCount: number;
  status: ProductStatus;
  productCreatedAt: Date;
  productUpdatedAt: Date;
  lastEventId: string;
  lastEventAt: Date;
}

/**
 * One product as the search read model sees it. It is a projection, not an aggregate: it never raises events and
 * only ever changes by applying newer catalog facts. The version of a document is (snapshot updatedAt, event
 * occurredAt), which lets the projection ignore stale snapshots delivered late (replayed dead letters, rebuilds).
 */
export class SearchDocument {
  private constructor(private readonly props: SearchDocumentProps) {}

  static fromSnapshot(snapshot: ProductSnapshot, meta: EventMeta): SearchDocument {
    const createdAt = new Date(snapshot.createdAt);
    const updatedAt = new Date(snapshot.updatedAt);
    if (!snapshot.productId?.trim()) throw new ValidationError("Product snapshot without productId");
    if (!/^[a-z0-9][a-z0-9-]{0,199}$/.test(snapshot.slug ?? "")) throw new ValidationError("Product snapshot with an invalid slug", { slug: snapshot.slug });
    if (!snapshot.name?.trim()) throw new ValidationError("Product snapshot without a name");
    if (!Number.isSafeInteger(snapshot.priceCents) || snapshot.priceCents < 0) throw new ValidationError("Product price must be whole, non-negative cents");
    if (!Number.isSafeInteger(snapshot.ratingCount) || snapshot.ratingCount < 0) throw new ValidationError("Rating count must be a non-negative integer");
    if (snapshot.ratingAvg !== null && !(snapshot.ratingAvg >= 0 && snapshot.ratingAvg <= 5)) throw new ValidationError("Rating average must be between 0 and 5");
    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())) throw new ValidationError("Product snapshot timestamps are invalid");
    const variants = snapshot.variants ?? [];
    return new SearchDocument({
      productId: snapshot.productId,
      slug: snapshot.slug,
      name: snapshot.name.trim(),
      kind: snapshot.kind?.trim() ?? "",
      story: snapshot.story ?? "",
      categoryId: snapshot.categoryId,
      categoryLabel: snapshot.categoryLabel,
      materials: distinct([...(snapshot.materials ?? []), ...variants.map((v) => v.material)]),
      colors: distinct(variants.map((v) => v.colorFamily)),
      skus: [...new Set(variants.map((v) => v.sku.trim()).filter(Boolean))],
      variantLabels: [...new Set(variants.map((v) => v.label.trim()).filter(Boolean))],
      priceCents: snapshot.priceCents,
      featured: snapshot.featured,
      // Events written before amendment 1p carry no flag; those products were never stopped.
      soldOut: snapshot.soldOut === true,
      heroImageUrl: snapshot.heroImageUrl,
      ratingAvg: snapshot.ratingAvg,
      ratingCount: snapshot.ratingCount,
      status: snapshot.status,
      productCreatedAt: createdAt,
      productUpdatedAt: updatedAt,
      lastEventId: meta.messageId,
      lastEventAt: meta.occurredAt,
    });
  }

  static restore(props: SearchDocumentProps): SearchDocument {
    return new SearchDocument({ ...props });
  }

  get productId(): string {
    return this.props.productId;
  }

  get slug(): string {
    return this.props.slug;
  }

  get status(): ProductStatus {
    return this.props.status;
  }

  get skus(): readonly string[] {
    return this.props.skus;
  }

  get soldOut(): boolean {
    return this.props.soldOut;
  }

  /**
   * Availability rule (amendment 1p): in stock only when the catalog has not flagged the product sold out AND at
   * least one variant SKU is not known to be unavailable (a SKU without inventory facts counts as available).
   * `skuAvailable` returns the latest known availability or undefined. The SQL read model mirrors this rule.
   */
  inStock(skuAvailable: (sku: string) => boolean | undefined): boolean {
    if (this.props.soldOut) return false;
    return this.props.skus.some((sku) => skuAvailable(sku) !== false);
  }

  /** Only published products are searchable; drafts and archived products stay as tombstones. */
  get searchable(): boolean {
    return this.props.status === "published";
  }

  toProps(): SearchDocumentProps {
    return { ...this.props, materials: [...this.props.materials], colors: [...this.props.colors], skus: [...this.props.skus], variantLabels: [...this.props.variantLabels] };
  }

  /**
   * Whether this (incoming) snapshot should replace `current`. Newer snapshot versions win; for an equal snapshot
   * version the later event wins (e.g. a rating update that kept updatedAt). An archived tombstone is only replaced
   * by something strictly newer, so a replayed old ProductPublished cannot resurrect an archived product.
   */
  supersedes(current: SearchDocument | null): boolean {
    if (!current) return true;
    const order = compareVersions(this.version(), current.version());
    return current.status === "archived" ? order > 0 : order >= 0;
  }

  /** Archive the product (ProductArchived). Returns null when the archive fact is older than what is indexed. */
  archive(meta: EventMeta): SearchDocument | null {
    if (meta.occurredAt.getTime() < this.props.lastEventAt.getTime()) return null;
    return new SearchDocument({ ...this.props, status: "archived", lastEventId: meta.messageId, lastEventAt: meta.occurredAt });
  }

  private version(): [number, number] {
    return [this.props.productUpdatedAt.getTime(), this.props.lastEventAt.getTime()];
  }
}

function compareVersions(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value?.trim().toLowerCase()).filter((value): value is string => Boolean(value)))];
}
