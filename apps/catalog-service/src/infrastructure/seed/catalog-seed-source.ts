import { Injectable } from "@nestjs/common";
import { type CatalogSeed, CatalogSeedSource } from "../../application/ports/catalog-seed-source";
import { seedCategories } from "./categories";
import { seedMaterials } from "./materials";
import { seedProducts } from "./products";

@Injectable()
export class StorefrontCatalogSeedSource extends CatalogSeedSource {
  load(): CatalogSeed {
    return {
      categories: seedCategories.map((c) => ({ ...c })),
      materials: seedMaterials.map(({ match: _match, ...m }) => m),
      products: seedProducts.map((p) => ({ ...p, materials: [...p.materials], variants: p.variants.map((v) => ({ ...v })), details: { ...p.details } })),
    };
  }
}
