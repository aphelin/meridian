import { DevOnly } from "@meridian/nest-kit";
import { Controller, HttpCode, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { SeedCatalogCommand, type SeedCatalogResult } from "../../application/commands/seed-catalog.command";

@Controller("seed")
@DevOnly()
export class SeedController {
  constructor(private readonly commandBus: CommandBus) {}

  /** Idempotent: loads the storefront catalog; unchanged products are not republished. */
  @Post()
  @HttpCode(200)
  seed(): Promise<SeedCatalogResult> {
    return this.commandBus.execute(new SeedCatalogCommand());
  }
}
