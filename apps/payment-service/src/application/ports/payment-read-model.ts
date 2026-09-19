import type { PaymentSummaryDto } from "@meridian/contracts";

export abstract class PaymentReadModel {
  abstract summaryByOrder(orderId: string): Promise<PaymentSummaryDto | null>;
}
