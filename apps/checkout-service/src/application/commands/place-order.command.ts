import type { PlaceOrderRequest, PlaceOrderResultDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class PlaceOrderCommand extends Command<PlaceOrderResultDto> {
  constructor(
    readonly request: PlaceOrderRequest,
    readonly userId: string | null,
    readonly cartId: string | null,
    readonly correlationId: string,
  ) {
    super();
  }
}
