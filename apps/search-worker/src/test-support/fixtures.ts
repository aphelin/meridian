import type { ProductSnapshot } from "@meridian/contracts";
import type { EventMeta } from "../domain";

export function snapshot(over: Partial<ProductSnapshot> = {}): ProductSnapshot {
  return {
    productId: "prod_holt",
    slug: "holt-sofa",
    name: "Holt",
    kind: "Three-seat sofa",
    story: "Soft wool for quiet rooms",
    categoryId: "seating",
    categoryLabel: "Seating",
    materials: ["Wool"],
    priceCents: 240_000,
    currency: "EUR",
    status: "published",
    featured: true,
    soldOut: false,
    heroImageUrl: "/products/holt.jpg",
    variants: [
      { sku: "HOLT-OAT", variantId: "oat", label: "Oatmeal wool", colorFamily: "neutral", material: "wool", swatchUrl: "/m.jpg", imageUrl: "/i.jpg" },
      { sku: "HOLT-CHA", variantId: "cha", label: "Charcoal wool", colorFamily: "grey", material: "wool", swatchUrl: "/m.jpg", imageUrl: "/i.jpg" },
    ],
    ratingAvg: null,
    ratingCount: 0,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...over,
  };
}

export function meta(occurredAt: string, messageId = `msg-${occurredAt}`): EventMeta {
  return { messageId, occurredAt: new Date(occurredAt) };
}
