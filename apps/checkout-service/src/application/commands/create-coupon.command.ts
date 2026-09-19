import type { CouponDto, CouponInput } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class CreateCouponCommand extends Command<CouponDto> {
  constructor(
    readonly actorId: string,
    readonly input: CouponInput,
  ) {
    super();
  }
}
