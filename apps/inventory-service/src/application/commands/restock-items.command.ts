import type { SkuQty } from "@meridian/contracts";

export class RestockItemsCommand {
  constructor(
    readonly orderId: string,
    readonly returnId: string | null,
    readonly lines: SkuQty[],
    /** RabbitMQ messageId; the inbox dedupes redeliveries. */
    readonly messageId: string,
  ) {}
}

export const RESTOCK_CONSUMER = "inventory.restock";
/** Second inbox key: one restock per return (or per order when it is not a return), whatever the messageId. */
export const RESTOCK_SOURCE_CONSUMER = "inventory.restock:source";
