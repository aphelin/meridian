import type { InvoiceLinkDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";
import type { OrderViewer } from "../services/order-access";

export class GetInvoiceLinkQuery extends Query<InvoiceLinkDto> {
  constructor(
    readonly orderId: string,
    readonly viewer: OrderViewer | null,
    readonly accessToken: string | null,
  ) {
    super();
  }
}
