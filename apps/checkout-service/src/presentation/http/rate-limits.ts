import type { RateLimitPolicy } from "@meridian/nest-kit";

/** PLAN rate-limit table. */
export const QUOTE_POLICY: RateLimitPolicy = { name: "quote", limit: 60, windowSec: 60, by: ["ip"] };
export const PLACE_ORDER_POLICY: RateLimitPolicy = { name: "place-order", limit: 10, windowSec: 600, by: ["ip", "user"] };
