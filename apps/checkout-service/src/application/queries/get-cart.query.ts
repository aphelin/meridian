import type { CartDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";

export class GetCartQuery extends Query<CartDto> {
  constructor(
    readonly userId: string | null,
    readonly cartId: string | null,
  ) {
    super();
  }
}
