import type { DomainEvent } from "@meridian/kernel";

export type ProductField =
  | "slug"
  | "name"
  | "kind"
  | "story"
  | "categoryId"
  | "categoryLabel"
  | "materials"
  | "priceCents"
  | "featured"
  | "soldOut"
  | "heroImageUrl"
  | "detailImageUrl"
  | "details"
  | "variants"
  | "images"
  | "rating";

export type ProductPublishedEvent = DomainEvent<"ProductPublished", Record<string, never>>;
export type ProductUpdatedEvent = DomainEvent<"ProductUpdated", { changed: ProductField[] }>;
export type ProductArchivedEvent = DomainEvent<"ProductArchived", { slug: string }>;
export type ProductEvent = ProductPublishedEvent | ProductUpdatedEvent | ProductArchivedEvent;

/** What a unit of work tells downstream consumers about one product. */
export type ProductNotice = { kind: "published" } | { kind: "updated"; changed: ProductField[] } | { kind: "archived" };

/**
 * Collapses the events one command raised on a product into at most one notice, judged by the final lifecycle event:
 * archived (consumers drop the product) or published (the snapshot already contains every change); otherwise one
 * ProductUpdated with the union of changed fields in first-seen order.
 */
export function collapseProductEvents(events: readonly ProductEvent[]): ProductNotice | null {
  const lastLifecycle = [...events].reverse().find((e) => e.name !== "ProductUpdated");
  if (lastLifecycle) return lastLifecycle.name === "ProductArchived" ? { kind: "archived" } : { kind: "published" };
  const changed: ProductField[] = [];
  for (const event of events) {
    if (event.name !== "ProductUpdated") continue;
    for (const field of event.payload.changed) if (!changed.includes(field)) changed.push(field);
  }
  return changed.length ? { kind: "updated", changed } : null;
}
