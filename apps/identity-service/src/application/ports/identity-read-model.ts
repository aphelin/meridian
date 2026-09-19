import type { AddressDto, CustomerListDto, UserDto } from "@meridian/contracts";

export interface CustomerListCriteria {
  q: string | null;
  cursor: string | null;
  limit: number;
}

/** Query side: reads DTOs straight from storage without loading aggregates. */
export abstract class IdentityReadModel {
  abstract userById(id: string): Promise<UserDto | null>;
  /** Null when the user does not exist. */
  abstract addressesOf(userId: string): Promise<AddressDto[] | null>;
  abstract customers(criteria: CustomerListCriteria): Promise<CustomerListDto>;
}
