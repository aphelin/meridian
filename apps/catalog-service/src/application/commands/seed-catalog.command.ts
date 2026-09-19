import { Command } from "@nestjs/cqrs";

export interface SeedCatalogResult {
  categories: { total: number; changed: number };
  materials: { total: number; changed: number };
  products: { total: number; created: number; updated: number; unchanged: number };
}

export class SeedCatalogCommand extends Command<SeedCatalogResult> {}
