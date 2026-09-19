import { ConsumerGroups, type EventEnvelope, type EventPayloads } from "@meridian/contracts";
import { KafkaEventHandler } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { eventMeta, STOCK_EVENTS, type EventMeta, type StockEventName } from "../../domain";
import { ArchiveProductCommand, IndexProductCommand, RecordStockEventCommand } from "../commands";
import { parsePayload, permanentOnValidation } from "./message-errors";

const COLOR_FAMILIES = ["neutral", "white", "black", "grey", "brown", "green", "blue", "red", "orange", "yellow", "pink", "metal"] as const;
const id = z.string().trim().min(1).max(200);
const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "must be an ISO date-time");

export const productSnapshotSchema = z.object({
  productId: id,
  slug: id,
  name: z.string().min(1).max(300),
  kind: z.string().max(300),
  story: z.string().max(20_000),
  categoryId: id,
  categoryLabel: z.string().min(1).max(200),
  materials: z.array(z.string().max(100)).max(50),
  priceCents: z.number().int().min(0),
  currency: z.literal("EUR"),
  status: z.enum(["draft", "published", "archived"]),
  featured: z.boolean(),
  /** Amendment 1p; absent on events written before it (never sold out). */
  soldOut: z.boolean().default(false),
  heroImageUrl: z.string().max(2000),
  variants: z
    .array(
      z.object({
        sku: id,
        variantId: id,
        label: z.string().max(300),
        colorFamily: z.enum(COLOR_FAMILIES),
        material: z.string().max(100),
        swatchUrl: z.string().max(2000),
        imageUrl: z.string().max(2000),
      }),
    )
    .max(200),
  ratingAvg: z.number().min(0).max(5).nullable(),
  ratingCount: z.number().int().min(0),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const productSnapshotPayload = z.object({ product: productSnapshotSchema });
const productArchivedPayload = z.object({ productId: id, slug: z.string() });
const skuQty = z.object({ sku: id, qty: z.number().int() });
const stockPayloads: Record<StockEventName, z.ZodType> = {
  StockReserved: z.object({ orderId: id, lines: z.array(skuQty), expiresAt: z.string() }),
  StockReservationReleased: z.object({ orderId: id, lines: z.array(skuQty), reason: z.string() }),
  StockCommitted: z.object({ orderId: id, lines: z.array(skuQty) }),
  StockAdjusted: z.object({ sku: id, onHand: z.number().int(), reserved: z.number().int(), available: z.number().int(), previousAvailable: z.number().int(), actorId: z.string().nullable(), reason: z.string() }),
  StockDepleted: z.object({ sku: id }),
  StockReplenished: z.object({ sku: id, available: z.number().int() }),
};

/**
 * Consumer group `search-indexer`: the only writer of the search read model. Catalog snapshots become search
 * documents, inventory facts become per-SKU availability. Contract violations go straight to the group's DLT;
 * database failures are retried by the kit and then dead-lettered, while later events keep flowing.
 */
@Injectable()
export class SearchIndexerConsumer {
  constructor(private readonly commandBus: CommandBus) {}

  @KafkaEventHandler({ group: ConsumerGroups.searchIndexer, events: ["ProductPublished", "ProductUpdated"] })
  async onProductSnapshot(envelope: EventEnvelope): Promise<void> {
    const { product } = parsePayload(productSnapshotPayload, envelope.payload, envelope.name);
    await permanentOnValidation(() => this.commandBus.execute(new IndexProductCommand(product, metaOf(envelope))));
  }

  @KafkaEventHandler({ group: ConsumerGroups.searchIndexer, events: ["ProductArchived"] })
  async onProductArchived(envelope: EventEnvelope): Promise<void> {
    const { productId } = parsePayload(productArchivedPayload, envelope.payload, envelope.name);
    await permanentOnValidation(() => this.commandBus.execute(new ArchiveProductCommand(productId, metaOf(envelope))));
  }

  @KafkaEventHandler({ group: ConsumerGroups.searchIndexer, events: [...STOCK_EVENTS] })
  async onStockEvent(envelope: EventEnvelope): Promise<void> {
    const name = envelope.name as StockEventName;
    const payload = parsePayload(stockPayloads[name], envelope.payload, name) as EventPayloads[StockEventName];
    await permanentOnValidation(() => this.commandBus.execute(new RecordStockEventCommand(name, payload, metaOf(envelope))));
  }
}

function metaOf(envelope: EventEnvelope): EventMeta {
  return eventMeta(envelope.messageId, envelope.occurredAt);
}
