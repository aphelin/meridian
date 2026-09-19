import type { AddressDto } from "@meridian/contracts";
import { type Clock, CLOCK } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";
import { UnitOfWork } from "../ports";
import { invalidSession } from "../services/account-errors";
import { toAddressDto } from "../services/mappers";
import { AddAddressCommand } from "./add-address.command";

@CommandHandler(AddAddressCommand)
export class AddAddressHandler implements ICommandHandler<AddAddressCommand, AddressDto> {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(command: AddAddressCommand): Promise<AddressDto> {
    return this.uow.run(async (scope) => {
      const user = await scope.users.findById(command.userId);
      if (!user) throw invalidSession();
      const address = user.addAddress(randomUUID(), command.input, this.clock.now());
      await scope.users.save(user);
      return toAddressDto(address);
    });
  }
}
