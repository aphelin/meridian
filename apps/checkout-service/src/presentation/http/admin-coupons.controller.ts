import type { CouponDto } from "@meridian/contracts";
import { AdminOnly, CurrentUser, parseWith, type Principal, ZodBody } from "@meridian/nest-kit";
import { Controller, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { z } from "zod";
import { CreateCouponCommand, UpdateCouponCommand } from "../../application/commands";
import { ListCouponsQuery } from "../../application/queries";
import { couponCodeSchema, couponInputSchema, couponPatchSchema } from "./schemas";

@Controller("admin/coupons")
@AdminOnly()
export class AdminCouponsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(): Promise<CouponDto[]> {
    return this.queryBus.execute(new ListCouponsQuery());
  }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() admin: Principal, @ZodBody(couponInputSchema) body: z.infer<typeof couponInputSchema>): Promise<CouponDto> {
    return this.commandBus.execute(new CreateCouponCommand(admin.sub, body));
  }

  @Patch(":code")
  @HttpCode(200)
  update(@Param("code") code: string, @CurrentUser() admin: Principal, @ZodBody(couponPatchSchema) body: z.infer<typeof couponPatchSchema>): Promise<CouponDto> {
    return this.commandBus.execute(new UpdateCouponCommand(admin.sub, parseWith(couponCodeSchema, code), body));
  }
}
