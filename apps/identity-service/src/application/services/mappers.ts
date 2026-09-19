import type { AddressDto, UserDto } from "@meridian/contracts";
import type { Address, User } from "../../domain";

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toAddressDto(address: Address): AddressDto {
  return { id: address.id, isDefault: address.isDefault, ...address.details };
}
