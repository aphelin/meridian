import type { CouponDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";

export class ListCouponsQuery extends Query<CouponDto[]> {
  constructor() {
    super();
  }
}
