import type { PlaceOrderResultDto } from "@meridian/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { PlaceOrderSaga } from "../sagas/place-order.saga";
import { PlaceOrderCommand } from "./place-order.command";

/** Entry point of the orchestrated place-order saga. */
@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand, PlaceOrderResultDto> {
  constructor(private readonly saga: PlaceOrderSaga) {}

  execute(command: PlaceOrderCommand): Promise<PlaceOrderResultDto> {
    return this.saga.run(command);
  }
}
