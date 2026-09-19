import type { PaymentSummaryDto } from "@meridian/contracts";
import { NotFoundError } from "@meridian/kernel";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { PaymentReadModel } from "../ports";
import { GetPaymentByOrderQuery } from "./get-payment-by-order.query";

@QueryHandler(GetPaymentByOrderQuery)
export class GetPaymentByOrderHandler implements IQueryHandler<GetPaymentByOrderQuery, PaymentSummaryDto> {
  constructor(private readonly readModel: PaymentReadModel) {}

  async execute({ orderId }: GetPaymentByOrderQuery): Promise<PaymentSummaryDto> {
    const summary = await this.readModel.summaryByOrder(orderId);
    if (!summary) throw new NotFoundError("No payment exists for this order.");
    return summary;
  }
}
