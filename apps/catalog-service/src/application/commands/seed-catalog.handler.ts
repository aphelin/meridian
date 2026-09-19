import { CLOCK, type Clock } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { category as validCategory, material as validMaterial, sameCategory, sameMaterial } from "../../domain/catalog/category";
import { ReferenceDataRepository } from "../../domain/catalog/reference-data.repository";
import { Product } from "../../domain/product/product";
import { ProductRepository } from "../../domain/product/product.repository";
import { assertSkusAvailable } from "../../domain/product/sku-policy";
import { CatalogCache } from "../ports/catalog-cache";
import { CatalogSeedSource, type SeedProduct } from "../ports/catalog-seed-source";
import { TransactionRunner, type Tx } from "../ports/transaction";
import { ProductEventWriter } from "../services/product-event-writer";
import { SeedCatalogCommand, type SeedCatalogResult } from "./seed-catalog.command";

const log = createLogger("SeedCatalog");
type Outcome = "created" | "updated" | "unchanged";

/**
 * Loads the storefront catalog. Idempotent: reference data is upserted only when it differs, new products are created
 * and published (ProductPublished), existing ones are revised only where the seed differs (ProductUpdated when
 * published), and unchanged products write nothing. A catalog-wide lock serialises concurrent seeds across replicas.
 */
@CommandHandler(SeedCatalogCommand)
export class SeedCatalogHandler implements ICommandHandler<SeedCatalogCommand, SeedCatalogResult> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly source: CatalogSeedSource,
    private readonly referenceData: ReferenceDataRepository,
    private readonly products: ProductRepository,
    private readonly events: ProductEventWriter,
    private readonly cache: CatalogCache,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<SeedCatalogResult> {
    const seed = this.source.load();
    const categories = seed.categories.map(validCategory);
    const materials = seed.materials.map(validMaterial);
    const labels = new Map(categories.map((c) => [c.id, c.label]));

    const reference = await this.transactions.run(async (tx) => {
      await this.products.lockCatalog(tx);
      const currentCategories = new Map((await this.referenceData.categories(tx)).map((c) => [c.id, c]));
      const currentMaterials = new Map((await this.referenceData.materials(tx)).map((m) => [m.id, m]));
      const relabelled: string[] = [];
      let categoriesChanged = 0;
      for (const next of categories) {
        const current = currentCategories.get(next.id);
        if (current && sameCategory(current, next)) continue;
        if (current && current.label !== next.label) relabelled.push(next.id);
        await this.referenceData.saveCategory(next, tx);
        categoriesChanged++;
      }
      let materialsChanged = 0;
      for (const next of materials) {
        const current = currentMaterials.get(next.id);
        if (current && sameMaterial(current, next)) continue;
        await this.referenceData.saveMaterial(next, tx);
        materialsChanged++;
      }
      await this.announceRelabelled(tx, relabelled, labels);
      return { categoriesChanged, materialsChanged };
    });

    const outcomes: Outcome[] = [];
    for (const item of seed.products) {
      outcomes.push(await this.transactions.run((tx) => this.seedProduct(tx, item, labels)));
    }
    await this.cache.invalidate();

    const result: SeedCatalogResult = {
      categories: { total: categories.length, changed: reference.categoriesChanged },
      materials: { total: materials.length, changed: reference.materialsChanged },
      products: {
        total: seed.products.length,
        created: outcomes.filter((o) => o === "created").length,
        updated: outcomes.filter((o) => o === "updated").length,
        unchanged: outcomes.filter((o) => o === "unchanged").length,
      },
    };
    log.info("catalog seeded", { ...result });
    return result;
  }

  private async seedProduct(tx: Tx, item: SeedProduct, labels: ReadonlyMap<string, string>): Promise<Outcome> {
    await this.products.lockCatalog(tx);
    const now = this.clock.now();
    const { id, variants, ...content } = item;
    const existing = (await this.products.findById(id, tx, { forUpdate: true })) ?? (await this.products.findBySlug(content.slug, tx, { forUpdate: true }));
    const product = existing ?? Product.createDraft(id, content, now);
    const revised = existing ? product.revise(content, now).length > 0 : false;
    const variantsChanged = product.replaceVariants(variants, now);
    if (variantsChanged) {
      const skus = product.variants.map((v) => v.sku);
      assertSkusAvailable(product.id, skus, await this.products.skuOwners(skus, tx));
    }
    // New products go live; an admin's archive decision survives re-seeding.
    const published = product.status === "draft" ? product.publish(now) : false;
    if (existing && !revised && !variantsChanged && !published) return "unchanged";
    await this.products.save(product, tx);
    await this.events.write(tx, product, labels);
    return existing ? "updated" : "created";
  }

  private async announceRelabelled(tx: Tx, categoryIds: readonly string[], labels: ReadonlyMap<string, string>): Promise<void> {
    const now = this.clock.now();
    for (const categoryId of categoryIds) {
      for (const productId of await this.products.publishedIdsInCategory(categoryId, tx)) {
        const product = await this.products.findById(productId, tx, { forUpdate: true });
        if (!product) continue;
        product.categoryRelabelled(now);
        await this.events.write(tx, product, labels);
      }
    }
  }
}
