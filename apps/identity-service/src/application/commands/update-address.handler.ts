import type { AddressDto } from "@meridian/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { UnitOfWork } from "../ports";
import { invalidSession } from "../services/account-errors";
import { toAddressDto } from "../services/mappers";
import { UpdateAddressCommand } from "./update-address.command";

@CommandHandler(UpdateAddressCommand)
export class UpdateAddressHandler implements ICommandHandler<UpdateAddressCommand, AddressDto> {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}

  execute(command: UpdateAddressCommand): Promise<AddressDto> {
    return this.uow.run(async (scope) => {
      const user = await scope.users.findById(command.userId);
      if (!user) throw invalidSession();
      const address = user.updateAddress(command.addressId, command.change);
      await scope.users.save(user);
      return toAddressDto(address);
    });
  }
}
