import { orderAccessToken, orderLinkSecret, verifyOrderAccessToken } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { OrderAccessTokens } from "../../application/ports";

/** HMAC-SHA256(ORDER_LINK_SECRET, orderId) tokens from the kit; verification is timing-safe. */
@Injectable()
export class KitOrderAccessTokens extends OrderAccessTokens {
  constructor() {
    super();
    orderLinkSecret(); // fail fast at startup when ORDER_LINK_SECRET is required but missing
  }

  issue(orderId: string): string {
    return orderAccessToken(orderId);
  }

  verify(orderId: string, token: string | null | undefined): boolean {
    return verifyOrderAccessToken(orderId, token);
  }
}
