/** Integer minor units (euro cents). Every monetary amount in APIs, events and commands uses cents. */
export type Cents = number;
export type CurrencyCode = "EUR";

/** ISO 8601 timestamp string. */
export type IsoDateTime = string;

export interface PostalAddress {
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, upper case. */
  country: string;
  phone: string | null;
}

export interface CustomerRef {
  userId: string | null;
  email: string;
  name: string;
}

export type ShippingMethodId = "standard" | "express" | "white-glove" | "collect";

export interface PricingBreakdown {
  subtotalCents: Cents;
  discountCents: Cents;
  shippingCents: Cents;
  /** VAT contained in the total (prices are VAT-inclusive). */
  taxCents: Cents;
  taxRatePercent: number;
  totalCents: Cents;
  currency: CurrencyCode;
}

export type OrderStatus =
  | "placed"
  | "paid"
  | "fulfilling"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export type CancellationReason = "customer" | "admin" | "expired" | "out-of-stock" | "payment-unavailable";

export interface OrderLineSnapshot {
  sku: string;
  slug: string;
  productName: string;
  variantLabel: string;
  qty: number;
  unitPriceCents: Cents;
  lineTotalCents: Cents;
}

export interface SkuQty {
  sku: string;
  qty: number;
}

export type ProductStatus = "draft" | "published" | "archived";

export type ColorFamily =
  | "neutral"
  | "white"
  | "black"
  | "grey"
  | "brown"
  | "green"
  | "blue"
  | "red"
  | "orange"
  | "yellow"
  | "pink"
  | "metal";

export interface ProductVariantSnapshot {
  sku: string;
  /** Stable id used in URLs and carts, e.g. "charcoal". */
  variantId: string;
  label: string;
  colorFamily: ColorFamily;
  /** Material id from the catalog material list, e.g. "wool". */
  material: string;
  swatchUrl: string;
  imageUrl: string;
}

export interface ProductSnapshot {
  productId: string;
  slug: string;
  name: string;
  kind: string;
  story: string;
  categoryId: string;
  categoryLabel: string;
  materials: string[];
  priceCents: Cents;
  currency: CurrencyCode;
  status: ProductStatus;
  featured: boolean;
  /** Merchandising stop-sell (amendment 1p): when true the product is not purchasable and never in stock. */
  soldOut: boolean;
  heroImageUrl: string;
  variants: ProductVariantSnapshot[];
  ratingAvg: number | null;
  ratingCount: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Error body every service returns. `message` is safe to show to shoppers. */
export interface ApiError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  correlationId: string;
  details?: unknown;
}

export const ErrorCodes = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_TRANSITION",
  "OUT_OF_STOCK",
  "COUPON_INVALID",
  "COUPON_EXPIRED",
  "COUPON_MIN_BASKET",
  "COUPON_EXHAUSTED",
  "COUPON_ALREADY_USED",
  "ORDER_NOT_CANCELLABLE",
  "ORDER_NOT_RETURNABLE",
  "ORDER_NOT_PAYABLE",
  "REVIEW_NOT_ALLOWED",
  "RATE_LIMITED",
  "CAPTCHA_REQUIRED",
  "CAPTCHA_INVALID",
  "CAPTCHA_UNAVAILABLE",
  "UPSTREAM_UNAVAILABLE",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "IDEMPOTENCY_MISMATCH",
  "IDEMPOTENCY_IN_FLIGHT",
  "SANDBOX_ONLY",
  "CHAOS_INJECTED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ErrorCodes)[number];

/** Cursor pagination used by every list endpoint. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
