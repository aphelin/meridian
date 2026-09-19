import type { CreateIntentRequest, PaymentIntentDto } from "@meridian/contracts";
import { Injectable } from "@nestjs/common";
import { PaymentIntents } from "../../application/ports";
import { UpstreamClients } from "./upstream-clients";

/** payment-service `POST /intents` (service token, idempotent per order). */
@Injectable()
export class HttpPaymentIntents extends PaymentIntents {
  constructor(private readonly clients: UpstreamClients) {
    super();
  }

  createIntent(request: CreateIntentRequest): Promise<PaymentIntentDto> {
    return this.clients.payment.post<PaymentIntentDto>("/intents", request, { idempotencyKey: `intent-${request.orderId}` });
  }
}
