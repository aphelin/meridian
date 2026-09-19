import type { Material } from "../../domain/catalog/category";

/**
 * Ported from apps/storefront/lib/catalog.ts `materials`. `match` is the storefront's rule for deriving a product's
 * material ids from its material text and variant labels; it is kept to derive and verify the seeded `materials`.
 */
export const seedMaterials: (Material & { match: RegExp })[] = [
  { id: "oak", label: "Oak", swatchUrl: "/materials/oak.jpg", match: /\boak\b/i, position: 0 },
  { id: "walnut", label: "Walnut", swatchUrl: "/materials/walnut.jpg", match: /walnut/i, position: 1 },
  { id: "ash", label: "Ash", swatchUrl: "/materials/ash.jpg", match: /\bash\b/i, position: 2 },
  { id: "wool", label: "Wool", swatchUrl: "/materials/wool-oatmeal.jpg", match: /wool/i, position: 3 },
  { id: "linen", label: "Linen", swatchUrl: "/materials/linen-ochre.jpg", match: /linen/i, position: 4 },
  { id: "leather", label: "Leather", swatchUrl: "/materials/leather-saddle.jpg", match: /leather/i, position: 5 },
  { id: "velvet", label: "Velvet", swatchUrl: "/materials/velvet-ink.jpg", match: /velvet/i, position: 6 },
  { id: "boucle", label: "Boucle", swatchUrl: "/materials/boucle-ivory.jpg", match: /boucle/i, position: 7 },
  { id: "brass", label: "Brass", swatchUrl: "/materials/brass.jpg", match: /brass/i, position: 8 },
  { id: "steel", label: "Steel", swatchUrl: "/materials/black-steel.jpg", match: /steel/i, position: 9 },
  { id: "glass", label: "Glass", swatchUrl: "/materials/glass-blush.jpg", match: /glass/i, position: 10 },
  { id: "ceramic", label: "Ceramic", swatchUrl: "/materials/ceramic-cobalt.jpg", match: /ceramic/i, position: 11 },
  { id: "paint", label: "Painted", swatchUrl: "/materials/paint-sage.jpg", match: /paint/i, position: 12 },
  { id: "cane", label: "Cane", swatchUrl: "/materials/cane.jpg", match: /\bcane\b|rattan/i, position: 13 },
  { id: "stone", label: "Stone", swatchUrl: "/materials/travertine.jpg", match: /travertine|\bmarble\b/i, position: 14 },
  { id: "paper-cord", label: "Paper cord", swatchUrl: "/materials/paper-cord.jpg", match: /paper cord|paper-cord/i, position: 15 },
  { id: "stoneware", label: "Stoneware", swatchUrl: "/materials/stoneware.jpg", match: /stoneware/i, position: 16 },
  { id: "terrazzo", label: "Terrazzo", swatchUrl: "/materials/terrazzo.jpg", match: /terrazzo/i, position: 17 },
  { id: "cork", label: "Cork", swatchUrl: "/materials/cork.jpg", match: /cork/i, position: 18 },
];

/** The storefront's `materialIds(piece)`: materials whose rule matches the material text or a variant label, in list order. */
export function deriveMaterialIds(materialText: string, variantLabels: readonly string[]): string[] {
  const text = `${materialText} ${variantLabels.join(" ")}`;
  return seedMaterials.filter((m) => m.match.test(text)).map((m) => m.id);
}
