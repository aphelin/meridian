/** Admin: truncate the read model and replay the search-indexer group from the earliest offsets. */
export class RebuildSearchIndexCommand {
  constructor(readonly requestedBy: string | null) {}
}
