import type { Category } from "../../domain/catalog/category";

/** Ported from apps/storefront/lib/catalog.ts `categories`. */
export const seedCategories: Category[] = [
  { id: "seating", label: "Seating", blurb: "Sofas, lounge chairs, a daybed and a stool in wool, leather, velvet and boucle.", coverImageUrl: "/products/soren-sofa-hero.jpg", position: 0 },
  { id: "tables", label: "Tables", blurb: "Dining, writing and low tables in oak, walnut and pale ash.", coverImageUrl: "/products/dune-table-hero.jpg", position: 1 },
  { id: "lighting", label: "Lighting", blurb: "Floor, table and pendant lights in linen, glass, ceramic and brass.", coverImageUrl: "/products/lamp-arc-hero.jpg", position: 2 },
  { id: "storage", label: "Storage", blurb: "Cabinets, a sideboard, an open bookcase and a hall bench.", coverImageUrl: "/products/nook-cabinet-hero.jpg", position: 3 },
];
