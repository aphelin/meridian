import { DevOnly } from "@meridian/nest-kit";
import { Controller, HttpCode, HttpStatus, Inject, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { SeedAdminCommand, type SeedAdminResult } from "../../application";

@Controller("seed")
export class SeedController {
  constructor(@Inject(CommandBus) private readonly commandBus: CommandBus) {}

  @Post()
  @DevOnly()
  @HttpCode(HttpStatus.OK)
  seed(): Promise<SeedAdminResult> {
    return this.commandBus.execute(new SeedAdminCommand());
  }
}
