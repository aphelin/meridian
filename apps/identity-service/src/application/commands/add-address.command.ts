import type { AddressDto, AddressInput } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class AddAddressCommand extends Command<AddressDto> {
  constructor(
    readonly userId: string,
    readonly input: AddressInput,
  ) {
    super();
  }
}
