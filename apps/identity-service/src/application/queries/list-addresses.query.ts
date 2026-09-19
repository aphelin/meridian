import type { AddressDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";

export class ListAddressesQuery extends Query<AddressDto[]> {
  constructor(readonly userId: string) {
    super();
  }
}
