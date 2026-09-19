import type { EventPayloads } from "@meridian/contracts";
import type { EventMeta, StockEventName } from "../../domain";

/** Apply an inventory event to per-SKU availability. */
export class RecordStockEventCommand<N extends StockEventName = StockEventName> {
  constructor(
    readonly name: N,
    readonly payload: EventPayloads[N],
    readonly meta: EventMeta,
  ) {}
}
