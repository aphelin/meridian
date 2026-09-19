import { AdminOnly, CurrentUser, type Principal } from "@meridian/nest-kit";
import { Controller, HttpCode, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { RebuildProjectionsCommand, type RebuildResult } from "../../application/commands";

@Controller("admin/analytics")
@AdminOnly()
export class AdminAnalyticsController {
  constructor(private readonly commandBus: CommandBus) {}

  /** 202: the read model was emptied and the projector is replaying the log from the earliest offset. */
  @Post("rebuild")
  @HttpCode(202)
  rebuild(@CurrentUser() user: Principal | null): Promise<RebuildResult> {
    return this.commandBus.execute(new RebuildProjectionsCommand(user?.sub ?? null));
  }
}
