import type { AddressDto, UserDto } from "@meridian/contracts";
import { Authenticated, CurrentUser, parseWith, type Principal, RateLimit, ZodBody } from "@meridian/nest-kit";
import { Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { z } from "zod";
import {
  AddAddressCommand,
  ChangePasswordCommand,
  DeleteAccountCommand,
  GetCurrentUserQuery,
  ListAddressesQuery,
  RemoveAddressCommand,
  UpdateAddressCommand,
  UpdateProfileCommand,
} from "../../application";
import { RateLimits } from "./policies";
import { AddressBody, AddressIdParam, AddressPatchBody, ChangePasswordBody, DeleteAccountBody, UpdateProfileBody } from "./schemas";

/** The signed-in account. Every route acts on the token subject only, so one user can never reach another's data. */
@Controller("me")
@Authenticated()
export class MeController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get()
  me(@CurrentUser() user: Principal): Promise<UserDto> {
    return this.queryBus.execute(new GetCurrentUserQuery(user.sub));
  }

  @Patch()
  updateProfile(@CurrentUser() user: Principal, @ZodBody(UpdateProfileBody) body: z.infer<typeof UpdateProfileBody>): Promise<UserDto> {
    return this.commandBus.execute(new UpdateProfileCommand(user.sub, body.name));
  }

  @Post("password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(RateLimits.password)
  async changePassword(@CurrentUser() user: Principal, @ZodBody(ChangePasswordBody) body: z.infer<typeof ChangePasswordBody>): Promise<void> {
    await this.commandBus.execute(new ChangePasswordCommand(user.sub, body.currentPassword, body.newPassword, body.refreshToken ?? null));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(RateLimits.password)
  async deleteAccount(@CurrentUser() user: Principal, @ZodBody(DeleteAccountBody) body: z.infer<typeof DeleteAccountBody>): Promise<void> {
    await this.commandBus.execute(new DeleteAccountCommand(user.sub, body.password));
  }

  @Get("addresses")
  addresses(@CurrentUser() user: Principal): Promise<AddressDto[]> {
    return this.queryBus.execute(new ListAddressesQuery(user.sub));
  }

  @Post("addresses")
  addAddress(@CurrentUser() user: Principal, @ZodBody(AddressBody) body: z.infer<typeof AddressBody>): Promise<AddressDto> {
    return this.commandBus.execute(new AddAddressCommand(user.sub, body));
  }

  @Patch("addresses/:id")
  updateAddress(@CurrentUser() user: Principal, @Param("id") id: string, @ZodBody(AddressPatchBody) body: z.infer<typeof AddressPatchBody>): Promise<AddressDto> {
    return this.commandBus.execute(new UpdateAddressCommand(user.sub, parseWith(AddressIdParam, id), body));
  }

  @Delete("addresses/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAddress(@CurrentUser() user: Principal, @Param("id") id: string): Promise<void> {
    await this.commandBus.execute(new RemoveAddressCommand(user.sub, parseWith(AddressIdParam, id)));
  }
}
