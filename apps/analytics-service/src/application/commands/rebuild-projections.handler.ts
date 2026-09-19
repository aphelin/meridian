import { ConsumerGroups } from "@meridian/contracts";
import { ConflictError } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ProjectionUnitOfWork, ProjectorControl } from "../ports";
import { RebuildProjectionsCommand } from "./rebuild-projections.command";

const log = createLogger("RebuildProjections");

export interface RebuildResult {
  status: "replaying";
  startedAt: string;
}

/**
 * Order matters for safety:
 * 1. pause: no projection transaction can run while the model is rebuilt;
 * 2. reset offsets first: if that fails nothing was deleted and consuming resumes where it was;
 * 3. truncate read model + this consumer's Inbox rows in one transaction: if that fails, the replay finds every
 *    message already in the Inbox and the old model stays intact;
 * 4. resume, always, so a failed rebuild never leaves the projector stopped.
 * One rebuild per process at a time.
 */
@CommandHandler(RebuildProjectionsCommand)
export class RebuildProjectionsHandler implements ICommandHandler<RebuildProjectionsCommand, RebuildResult> {
  private running = false;

  constructor(
    private readonly control: ProjectorControl,
    private readonly uow: ProjectionUnitOfWork,
  ) {}

  async execute({ requestedBy }: RebuildProjectionsCommand): Promise<RebuildResult> {
    if (this.running) throw new ConflictError("An analytics rebuild is already running");
    this.running = true;
    const startedAt = new Date();
    log.info("analytics rebuild started", { requestedBy });
    try {
      try {
        await this.control.pause();
        await this.control.resetToEarliest();
        await this.uow.truncate(ConsumerGroups.analyticsProjector);
      } finally {
        await this.control.resume();
      }
      log.info("analytics rebuild replaying the log", { requestedBy, tookMs: Date.now() - startedAt.getTime() });
      return { status: "replaying", startedAt: startedAt.toISOString() };
    } catch (error) {
      log.error("analytics rebuild failed", { requestedBy, error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.running = false;
    }
  }
}
