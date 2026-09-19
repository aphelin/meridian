import type { AddressDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";
import type { AddressChange } from "../../domain";

export class UpdateAddressCommand extends Command<AddressDto> {
  constructor(
    readonly userId: string,
    readonly addressId: string,
    readonly change: AddressChange,
  ) {
    super();
  }
}
