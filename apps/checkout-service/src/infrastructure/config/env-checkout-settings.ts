import { envInt } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CheckoutSettings } from "../../application/ports";

@Injectable()
export class EnvCheckoutSettings extends CheckoutSettings {
  readonly orderHoldMinutes = envInt("ORDER_HOLD_MINUTES", 15, { min: 1, max: 24 * 60 });
  readonly invoiceLinkSeconds = envInt("INVOICE_LINK_SECONDS", 300, { min: 30, max: 3600 });
}
