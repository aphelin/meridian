import { Injectable } from "@nestjs/common";
import { OutboxWriter } from "@meridian/nest-kit";
import { ReferenceDataRepository } from "../../domain/catalog/reference-data.repository";
import type { Product } from "../../domain/product/product";
import { collapseProductEvents } from "../../domain/product/product-events";
import { toProductSnapshot } from "../../domain/product/product-snapshot";
import type { Tx } from "../ports/transaction";

/**
 * Turns the events a command raised on a product into outbox rows in the same transaction: at most one
 * ProductPublished / ProductUpdated / ProductArchived per product per unit of work, keyed by the product id, with the
 * contracts snapshot of the final state.
 */
@Injectable()
export class ProductEventWriter {
  constructor(
    private readonly outbox: OutboxWriter,
    private readonly referenceData: ReferenceDataRepository,
  ) {}

  /** Returns whether a message was written. */
  async write(tx: Tx, product: Product, categoryLabels?: ReadonlyMap<string, string>): Promise<boolean> {
    const notice = collapseProductEvents(product.pullEvents());
    if (!notice) return false;
    const aggregate = { type: "Product", id: product.id };
    if (notice.kind === "archived") {
      await this.outbox.event(tx, "ProductArchived", aggregate, { productId: product.id, slug: product.slug });
      return true;
    }
    const label = await this.categoryLabel(tx, product.categoryId, categoryLabels);
    const snapshot = toProductSnapshot(product, label);
    if (notice.kind === "published") await this.outbox.event(tx, "ProductPublished", aggregate, { product: snapshot });
    else await this.outbox.event(tx, "ProductUpdated", aggregate, { product: snapshot, changed: notice.changed });
    return true;
  }

  private async categoryLabel(tx: Tx, categoryId: string, known?: ReadonlyMap<string, string>): Promise<string> {
    const cached = known?.get(categoryId);
    if (cached !== undefined) return cached;
    const categories = await this.referenceData.categories(tx);
    return categories.find((c) => c.id === categoryId)?.label ?? categoryId;
  }
}
