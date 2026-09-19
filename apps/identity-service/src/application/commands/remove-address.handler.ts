import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { UnitOfWork } from "../ports";
import { invalidSession } from "../services/account-errors";
import { RemoveAddressCommand } from "./remove-address.command";

@CommandHandler(RemoveAddressCommand)
export class RemoveAddressHandler implements ICommandHandler<RemoveAddressCommand, void> {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}

  async execute(command: RemoveAddressCommand): Promise<void> {
    await this.uow.run(async (scope) => {
      const user = await scope.users.findById(command.userId);
      if (!user) throw invalidSession();
      user.removeAddress(command.addressId);
      await scope.users.save(user);
    });
  }
}
