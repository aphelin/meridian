import type { PaymentSummaryDto } from "@meridian/contracts";
import { createLogger, UpstreamHttpError } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { PaymentSummaries } from "../../application/ports";
import { UpstreamClients } from "./upstream-clients";

const log = createLogger("HttpPaymentSummaries");

/**
 * payment-service `GET /payments/by-order/:orderId` (service token) through its own client "payment-summary" (short
 * timeout, own breaker, so admin reads never trip the breaker that guards payment intents). Degrades to null.
 */
@Injectable()
export class HttpPaymentSummaries extends PaymentSummaries {
  constructor(private readonly clients: UpstreamClients) {
    super();
  }

  async forOrder(orderId: string): Promise<PaymentSummaryDto | null> {
    try {
      return await this.clients.paymentSummary.get<PaymentSummaryDto>(`/payments/by-order/${encodeURIComponent(orderId)}`);
    } catch (error) {
      if (!(error instanceof UpstreamHttpError && error.status === 404)) {
        log.warn("payment summary unavailable; showing the order without it", { orderId, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
      }
      return null;
    }
  }
}
