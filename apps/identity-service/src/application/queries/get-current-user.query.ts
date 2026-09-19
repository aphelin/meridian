import type { UserDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";

export class GetCurrentUserQuery extends Query<UserDto> {
  constructor(readonly userId: string) {
    super();
  }
}
