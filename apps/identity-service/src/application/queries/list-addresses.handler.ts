import type { AddressDto } from "@meridian/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { IdentityReadModel } from "../ports";
import { invalidSession } from "../services/account-errors";
import { ListAddressesQuery } from "./list-addresses.query";

@QueryHandler(ListAddressesQuery)
export class ListAddressesHandler implements IQueryHandler<ListAddressesQuery, AddressDto[]> {
  constructor(@Inject(IdentityReadModel) private readonly read: IdentityReadModel) {}

  async execute(query: ListAddressesQuery): Promise<AddressDto[]> {
    const addresses = await this.read.addressesOf(query.userId);
    if (!addresses) throw invalidSession();
    return addresses;
  }
}
