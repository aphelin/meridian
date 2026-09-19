import type { CouponDto } from "@meridian/contracts";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { AuditLog, auditEntry, Coupon, CouponRepository } from "../../domain";
import { toCouponDto } from "../mappers/coupon-dto.mapper";
import { UnitOfWork } from "../ports";
import { CreateCouponCommand } from "./create-coupon.command";

const date = (value: string | null) => (value ? new Date(value) : null);

/** Admin creates a coupon (terms validated by the aggregate; a taken code is 409) with an audit row. */
@CommandHandler(CreateCouponCommand)
export class CreateCouponHandler implements ICommandHandler<CreateCouponCommand, CouponDto> {
  constructor(
    private readonly coupons: CouponRepository,
    private readonly audit: AuditLog,
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ actorId, input }: CreateCouponCommand): Promise<CouponDto> {
    const coupon = Coupon.create({ ...input, startsAt: date(input.startsAt), expiresAt: date(input.expiresAt) });
    await this.uow.run(async (tx) => {
      await this.coupons.create(coupon, tx);
      await this.audit.append(
        auditEntry({ action: "coupon.create", actorId, subjectType: "coupon", subjectId: coupon.code, at: this.clock.now(), meta: { ...toCouponDto(coupon) } }),
        tx,
      );
    });
    return toCouponDto(coupon);
  }
}
