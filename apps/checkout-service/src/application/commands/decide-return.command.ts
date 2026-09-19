import type { ReturnDecisionInput, ReturnDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class DecideReturnCommand extends Command<ReturnDto> {
  constructor(
    readonly returnId: string,
    readonly actorId: string,
    readonly decision: ReturnDecisionInput,
  ) {
    super();
  }
}
