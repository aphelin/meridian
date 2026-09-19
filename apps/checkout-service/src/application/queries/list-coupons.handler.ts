import type { CouponDto } from "@meridian/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { CouponRepository } from "../../domain";
import { toCouponDto } from "../mappers/coupon-dto.mapper";
import { ListCouponsQuery } from "./list-coupons.query";

@QueryHandler(ListCouponsQuery)
export class ListCouponsHandler implements IQueryHandler<ListCouponsQuery, CouponDto[]> {
  constructor(private readonly coupons: CouponRepository) {}

  async execute(_query: ListCouponsQuery): Promise<CouponDto[]> {
    return (await this.coupons.list()).map(toCouponDto);
  }
}
