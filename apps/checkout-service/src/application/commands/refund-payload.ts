import type { CommandPayloads } from "@meridian/contracts";
import type { Refund } from "../../domain";

/** `payment.refund` for a pending refund the Order opened. */
export function refundCommandPayload(orderId: string, refund: Refund): CommandPayloads["payment.refund"] {
  return { orderId, refundId: refund.id, amountCents: refund.amountCents, reason: refund.reason, returnId: refund.returnId };
}
