import { ConflictError, DomainError } from "@meridian/kernel";

/** What checkout knows about one SKU from the catalog when it prices a line. */
export interface CatalogOfferState {
  sku: string;
  productName: string;
  status: string;
  /** Merchandising stop-sell (amendment 1p). */
  soldOut: boolean;
}

/**
 * Purchasability rule applied whenever a line is priced (cart line replacement, quote and the place-order saga, which
 * prices before it reserves): only published products that are not flagged sold out can be bought. A sold-out
 * product is refused with OUT_OF_STOCK (details.sku), the same code inventory uses, so shoppers see one answer.
 */
export const CatalogOffer = {
  assertPurchasable(offer: CatalogOfferState): void {
    if (offer.status !== "published") throw new ConflictError(`${offer.productName} is no longer available.`, { sku: offer.sku });
    if (offer.soldOut) throw new DomainError("OUT_OF_STOCK", `${offer.productName} is sold out.`, { sku: offer.sku });
  },
};
