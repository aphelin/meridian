import type { CustomerListDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";

export class ListCustomersQuery extends Query<CustomerListDto> {
  static readonly DEFAULT_LIMIT = 20;
  static readonly MAX_LIMIT = 100;

  constructor(
    readonly q: string | null,
    readonly cursor: string | null,
    readonly limit: number,
  ) {
    super();
  }
}
