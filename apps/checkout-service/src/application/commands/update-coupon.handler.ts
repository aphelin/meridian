import type { CouponDto } from "@meridian/contracts";
import { CLOCK, type Clock, NotFoundError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { AuditLog, auditEntry, type CouponPatch, CouponRepository } from "../../domain";
import { toCouponDto } from "../mappers/coupon-dto.mapper";
import { UnitOfWork } from "../ports";
import { UpdateCouponCommand } from "./update-coupon.command";

/** Admin changes a coupon's terms (partial). Unchanged fields are not audited; the redemption counter is never written. */
@CommandHandler(UpdateCouponCommand)
export class UpdateCouponHandler implements ICommandHandler<UpdateCouponCommand, CouponDto> {
  constructor(
    private readonly coupons: CouponRepository,
    private readonly audit: AuditLog,
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute({ actorId, code, patch }: UpdateCouponCommand): Promise<CouponDto> {
    return this.uow.run(async (tx) => {
      const coupon = await this.coupons.findByCode(code, tx);
      if (!coupon) throw new NotFoundError("Coupon not found.", { code });
      const { startsAt, expiresAt, ...rest } = patch;
      const domainPatch: CouponPatch = { ...rest };
      if (startsAt !== undefined) domainPatch.startsAt = startsAt ? new Date(startsAt) : null;
      if (expiresAt !== undefined) domainPatch.expiresAt = expiresAt ? new Date(expiresAt) : null;
      const changed = coupon.update(domainPatch);
      if (changed.length) {
        await this.coupons.updateTerms(coupon, tx);
        const after = toCouponDto(coupon) as unknown as Record<string, unknown>;
        await this.audit.append(
          auditEntry({ action: "coupon.update", actorId, subjectType: "coupon", subjectId: coupon.code, at: this.clock.now(), meta: { changed: Object.fromEntries(changed.map((key) => [key, after[key]])) } }),
          tx,
        );
      }
      return toCouponDto(coupon);
    });
  }
}
