import type { PaymentSummaryDto } from "@meridian/contracts";

/** payment-service view of an order's payment. Best effort: resolves null when unknown or unavailable, never rejects. */
export abstract class PaymentSummaries {
  abstract forOrder(orderId: string): Promise<PaymentSummaryDto | null>;
}
