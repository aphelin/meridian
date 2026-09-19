import type { IsoDateTime, Page, PostalAddress } from "../common";

export type Role = "customer" | "admin";

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  createdAt: IsoDateTime;
}

export interface AuthResultDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface AddressDto extends PostalAddress {
  id: string;
  label: string | null;
  isDefault: boolean;
}

export type AddressInput = PostalAddress & { label?: string | null; isDefault?: boolean };

export type CustomerListDto = Page<UserDto>;
