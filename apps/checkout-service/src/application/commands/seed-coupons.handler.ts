import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Coupon, CouponRepository } from "../../domain";
import { SeedCouponsCommand } from "./seed-coupons.command";

export const SEED_COUPONS = [
  { code: "NORTH-10", type: "percent", value: 10, minBasketCents: 0, maxRedemptions: null, oncePerCustomer: false, active: true, startsAt: null, expiresAt: null },
  { code: "WELCOME-50", type: "fixed", value: 5000, minBasketCents: 50_000, maxRedemptions: null, oncePerCustomer: true, active: true, startsAt: null, expiresAt: null },
] as const;

/** Idempotent: creates the demo coupons that are missing and never resets redemptions of existing ones. */
@CommandHandler(SeedCouponsCommand)
export class SeedCouponsHandler implements ICommandHandler<SeedCouponsCommand, { created: string[]; existing: string[] }> {
  constructor(private readonly coupons: CouponRepository) {}

  async execute(_command: SeedCouponsCommand): Promise<{ created: string[]; existing: string[] }> {
    const created: string[] = [];
    const existing: string[] = [];
    for (const seed of SEED_COUPONS) {
      const coupon = Coupon.create({ ...seed });
      if (await this.coupons.createIfMissing(coupon)) created.push(coupon.code);
      else existing.push(coupon.code);
    }
    return { created, existing };
  }
}
