import { DevOnly } from "@meridian/nest-kit";
import { Controller, HttpCode, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { SeedCouponsCommand } from "../../application/commands";

@Controller("seed")
export class SeedController {
  constructor(private readonly commandBus: CommandBus) {}

  /** Development only: demo coupons NORTH-10 and WELCOME-50 (idempotent). */
  @Post()
  @DevOnly()
  @HttpCode(200)
  seed(): Promise<{ created: string[]; existing: string[] }> {
    return this.commandBus.execute(new SeedCouponsCommand());
  }
}
