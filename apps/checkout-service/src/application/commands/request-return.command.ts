import type { ReturnDto, SkuQty } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";
import type { OrderViewer } from "../services/order-access";

export class RequestReturnCommand extends Command<ReturnDto> {
  constructor(
    readonly orderId: string,
    readonly viewer: OrderViewer | null,
    readonly accessToken: string | null,
    readonly lines: SkuQty[],
    readonly reason: string,
  ) {
    super();
  }
}
