import { ConsumerGroups, type EventEnvelope } from "@meridian/contracts";
import { createLogger, KafkaEventHandler } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { Sku } from "../../domain";
import { SyncCatalogStockCommand } from "../commands";
import { parsePayload } from "./message-errors";

const log = createLogger("CatalogSync");

const productPayload = z.object({
  product: z.object({
    productId: z.string().min(1),
    /** Amendment 1p; absent on events written before the amendment, which were never sold out. */
    soldOut: z.boolean().optional(),
    variants: z.array(z.object({ sku: z.string() })),
  }),
});

/** Group inventory-catalog-sync: every SKU in a published or updated product gets a stock row (never overwritten). */
@Injectable()
export class CatalogSyncConsumer {
  constructor(private readonly commandBus: CommandBus) {}

  @KafkaEventHandler({ group: ConsumerGroups.inventoryCatalogSync, events: ["ProductPublished", "ProductUpdated"] })
  async onProduct(envelope: EventEnvelope): Promise<void> {
    const { product } = parsePayload(productPayload, envelope.payload, envelope.name);
    const skus: string[] = [];
    for (const variant of product.variants) {
      try {
        skus.push(Sku.of(variant.sku).value);
      } catch {
        log.warn("variant with an invalid SKU skipped", { productId: product.productId, sku: variant.sku });
      }
    }
    if (!skus.length) return;
    await this.commandBus.execute(new SyncCatalogStockCommand(skus, product.productId, product.soldOut === true));
  }
}
