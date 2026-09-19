import { createLogger } from "@meridian/nest-kit";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { IndexReplayer, SearchIndexMaintenance } from "../ports";
import { EnsureReadModelCommand } from "./ensure-read-model.command";

const log = createLogger("EnsureReadModel");

export type EnsureReadModelResult = "populated" | "fresh-group" | "replaying";

@CommandHandler(EnsureReadModelCommand)
export class EnsureReadModelHandler implements ICommandHandler<EnsureReadModelCommand, EnsureReadModelResult> {
  constructor(
    private readonly replayer: IndexReplayer,
    private readonly maintenance: SearchIndexMaintenance,
  ) {}

  async execute(): Promise<EnsureReadModelResult> {
    if (!(await this.maintenance.isEmpty())) return "populated";
    // A group that never committed starts from the earliest offset by itself; no reset needed.
    if (!(await this.replayer.hasCommittedProgress())) return "fresh-group";
    log.warn("read model is empty but the consumer group has committed offsets; replaying the log");
    await this.replayer.replayFromEarliest(() => this.maintenance.truncate());
    return "replaying";
  }
}
