import type { Page } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";
import type { AdminReturnDto, ReturnFilter } from "../ports";

export class ListReturnsQuery extends Query<Page<AdminReturnDto>> {
  constructor(readonly filter: ReturnFilter) {
    super();
  }
}
