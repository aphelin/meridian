import type { Metadata } from "next";
import { SHOP_METADATA, ShopListing } from "@/components/shop/ShopListing";

// ISR: the unfiltered listing is prerendered and refreshed at most every 60 s, or on demand after admin writes
// (server/render-cache.ts). Filtered URLs are rewritten to the per-request /shop-filtered route (next.config.ts).
export const revalidate = 60;

export const metadata: Metadata = SHOP_METADATA;

export default function ShopPage() {
  return <ShopListing />;
}
