import type { OrderDto, TransitionRequest } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class TransitionOrderCommand extends Command<OrderDto> {
  constructor(
    readonly orderId: string,
    /** Admin subject (audit actor). */
    readonly actorId: string,
    readonly request: TransitionRequest,
  ) {
    super();
  }
}
