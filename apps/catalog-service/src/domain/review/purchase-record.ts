import { ensure } from "@meridian/kernel";
import { isSlug } from "../shared/slug";

/** Proof that a product was delivered to a customer; the basis for verified-purchase reviews. */
export interface PurchaseRecord {
  userId: string;
  slug: string;
  customerName: string;
  orderId: string;
  deliveredAt: Date;
}

/** One record per distinct product slug of a delivered order. Lines with malformed slugs are ignored. */
export function purchaseRecordsFromDelivery(input: { userId: string; customerName: string; orderId: string; deliveredAt: Date; slugs: readonly string[] }): PurchaseRecord[] {
  ensure(typeof input.userId === "string" && input.userId.length > 0, "VALIDATION_FAILED", "Delivered orders need a customer user id to record purchases.");
  ensure(!Number.isNaN(input.deliveredAt.getTime()), "VALIDATION_FAILED", "deliveredAt must be a valid time.");
  const slugs = [...new Set(input.slugs.filter(isSlug))];
  return slugs.map((slug) => ({ userId: input.userId, slug, customerName: input.customerName.trim().slice(0, 120), orderId: input.orderId, deliveredAt: input.deliveredAt }));
}
