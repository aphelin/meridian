import type { EventMeta } from "../../domain";

/** Apply ProductArchived: the product leaves search results but stays as a tombstone. */
export class ArchiveProductCommand {
  constructor(
    readonly productId: string,
    readonly meta: EventMeta,
  ) {}
}
