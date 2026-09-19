import type { UserDto } from "@meridian/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { IdentityReadModel } from "../ports";
import { invalidSession } from "../services/account-errors";
import { GetCurrentUserQuery } from "./get-current-user.query";

/** A token for a deleted account is answered 401 so the BFF ends the session. */
@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler implements IQueryHandler<GetCurrentUserQuery, UserDto> {
  constructor(@Inject(IdentityReadModel) private readonly read: IdentityReadModel) {}

  async execute(query: GetCurrentUserQuery): Promise<UserDto> {
    const user = await this.read.userById(query.userId);
    if (!user) throw invalidSession();
    return user;
  }
}
