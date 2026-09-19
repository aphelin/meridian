import { AdminOnly, CurrentUser, type Principal } from "@meridian/nest-kit";
import { Controller, HttpCode, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { RebuildSearchIndexCommand } from "../../application/commands";

@Controller("admin/search")
@AdminOnly()
export class AdminSearchController {
  constructor(private readonly commandBus: CommandBus) {}

  /** Truncates the read model and replays the search-indexer group from the earliest offsets. */
  @Post("rebuild")
  @HttpCode(202)
  rebuild(@CurrentUser() user: Principal | null): Promise<{ status: "rebuilding" }> {
    return this.commandBus.execute(new RebuildSearchIndexCommand(user?.sub ?? null));
  }
}
