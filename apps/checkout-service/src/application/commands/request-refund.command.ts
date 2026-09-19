import type { RefundDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export class RequestRefundCommand extends Command<RefundDto> {
  constructor(
    readonly orderId: string,
    readonly actorId: string,
    readonly amountCents: number,
    readonly reason: string,
  ) {
    super();
  }
}
