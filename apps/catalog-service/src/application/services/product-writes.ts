import type { ProductDto } from "@meridian/contracts";
import { NotFoundError } from "@meridian/kernel";
import { Injectable } from "@nestjs/common";
import type { Product } from "../../domain/product/product";
import { ProductRepository } from "../../domain/product/product.repository";
import { CatalogCache } from "../ports/catalog-cache";
import { CatalogReadModel } from "../ports/catalog-read-model";
import { TransactionRunner, type Tx } from "../ports/transaction";
import { ProductEventWriter } from "./product-event-writer";

/**
 * Unit of work for commands that change one existing product: lock the row, apply the change to the aggregate,
 * persist it together with its outbox message, then invalidate the shared catalog cache once the commit succeeded.
 */
@Injectable()
export class ProductWrites {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly products: ProductRepository,
    private readonly events: ProductEventWriter,
    private readonly cache: CatalogCache,
    private readonly readModel: CatalogReadModel,
  ) {}

  async change<T>(productId: string, work: (product: Product, tx: Tx) => Promise<T> | T): Promise<T> {
    const result = await this.transactions.run(async (tx) => {
      const product = await this.products.findById(productId, tx, { forUpdate: true });
      if (!product) throw new NotFoundError("Product not found.");
      const value = await work(product, tx);
      await this.products.save(product, tx);
      await this.events.write(tx, product);
      return value;
    });
    await this.cache.invalidate();
    return result;
  }

  async dto(productId: string): Promise<ProductDto> {
    const dto = await this.readModel.productById(productId);
    if (!dto) throw new NotFoundError("Product not found.");
    return dto;
  }
}
