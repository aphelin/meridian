import { assetOr } from "./plates";

// Requested Nano Banana plates. Each falls back to an existing image until the file lands.
export function heroImages() {
  return {
    desktop: "/hero/room-01.jpg",
    dining: assetOr("/hero/dining-room.jpg", "/products/dune-table-hero.jpg"),
    seating: assetOr("/categories/seating.jpg", "/products/soren-sofa-hero.jpg"),
    tables: assetOr("/categories/tables.jpg", "/products/dune-table-hero.jpg"),
    lighting: assetOr("/categories/lighting.jpg", "/products/lamp-arc-hero.jpg"),
    storage: assetOr("/categories/storage.jpg", "/products/nook-cabinet-hero.jpg"),
  };
}
