import type { CouponDto, CouponInput } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export type CouponUpdate = Partial<Omit<CouponInput, "code">>;

export class UpdateCouponCommand extends Command<CouponDto> {
  constructor(
    readonly actorId: string,
    readonly code: string,
    readonly patch: CouponUpdate,
  ) {
    super();
  }
}
