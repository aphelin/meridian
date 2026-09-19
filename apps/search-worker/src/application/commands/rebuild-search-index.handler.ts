import { ConflictError } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { IndexReplayer, SearchIndexMaintenance } from "../ports";
import { RebuildSearchIndexCommand } from "./rebuild-search-index.command";

const log = createLogger("RebuildSearchIndex");

@CommandHandler(RebuildSearchIndexCommand)
export class RebuildSearchIndexHandler implements ICommandHandler<RebuildSearchIndexCommand, { status: "rebuilding" }> {
  constructor(
    private readonly replayer: IndexReplayer,
    private readonly maintenance: SearchIndexMaintenance,
  ) {}

  /**
   * Accepts the rebuild and runs it in the background (stopping consumers waits for in-flight records, so it can
   * take seconds). A second request while one is running is a conflict; failures are logged with the caller's
   * correlation id and leave consumers running.
   */
  async execute({ requestedBy }: RebuildSearchIndexCommand): Promise<{ status: "rebuilding" }> {
    if (this.replayer.isReplaying()) throw new ConflictError("A search index rebuild is already in progress");
    log.info("search index rebuild requested", { requestedBy });
    this.replayer
      .replayFromEarliest(() => this.maintenance.truncate())
      .then(() => log.info("search index rebuild started replaying", { requestedBy }))
      .catch((error: unknown) => log.error("search index rebuild failed", { requestedBy, error: error instanceof Error ? error.message : String(error) }));
    return { status: "rebuilding" };
  }
}
