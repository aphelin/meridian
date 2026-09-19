import { ConsumerGroups } from "@meridian/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ProjectionUnitOfWork } from "../ports";
import { ProjectOrderFactCommand } from "./project-order-fact.command";

export type ProjectionOutcome = "projected" | "duplicate";

@CommandHandler(ProjectOrderFactCommand)
export class ProjectOrderFactHandler implements ICommandHandler<ProjectOrderFactCommand, ProjectionOutcome> {
  constructor(private readonly uow: ProjectionUnitOfWork) {}

  async execute({ messageId, fact, occurredAt }: ProjectOrderFactCommand): Promise<ProjectionOutcome> {
    const ran = await this.uow.once(ConsumerGroups.analyticsProjector, messageId, async (tx) => {
      const activity = await tx.lockOrder(fact.orderId);
      const delta = activity.apply(fact);
      if (!delta.isEmpty()) {
        await tx.saveOrder(activity);
        await tx.applyDelta(delta);
      }
      await tx.recordEvent(occurredAt);
    });
    return ran ? "projected" : "duplicate";
  }
}
