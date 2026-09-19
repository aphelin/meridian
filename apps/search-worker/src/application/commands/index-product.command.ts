import type { ProductSnapshot } from "@meridian/contracts";
import type { EventMeta } from "../../domain";

/** Apply a ProductPublished/ProductUpdated snapshot to the read model. */
export class IndexProductCommand {
  constructor(
    readonly snapshot: ProductSnapshot,
    readonly meta: EventMeta,
  ) {}
}
