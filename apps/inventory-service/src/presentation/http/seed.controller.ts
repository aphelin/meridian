import { DevOnly, ZodBody } from "@meridian/nest-kit";
import { Controller, HttpCode, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";
import { SeedStockCommand, type CreateStockItemsResult } from "../../application/commands";
import { seedStockSchema } from "./schemas";

/** Idempotent development seed: creates missing SKUs, never overwrites existing stock. 404 in production. */
@Controller("seed")
export class SeedController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @DevOnly()
  @HttpCode(200)
  seed(@ZodBody(seedStockSchema) body: z.output<typeof seedStockSchema>): Promise<CreateStockItemsResult> {
    return this.commandBus.execute(new SeedStockCommand(body.skus));
  }
}
