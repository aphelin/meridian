import { z } from "zod";

export const MAX_QTY = 20;
const SHIPPING_METHODS = ["standard", "express", "white-glove", "collect"] as const;

const sku = z.string().trim().min(1).max(64);
const country = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "Use a two-letter country code")
  .transform((value) => value.toUpperCase());

export const cartLineSchema = z.object({
  sku,
  variantId: z.string().trim().min(1).max(64),
  qty: z.int().min(1).max(MAX_QTY),
});

export const replaceCartItemsSchema = z.object({
  lines: z.array(cartLineSchema).max(50),
});

export const quoteRequestSchema = z.object({
  lines: z.array(cartLineSchema).max(50).optional(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  country,
  couponCode: z.string().trim().max(64).nullish(),
  email: z.email().max(254).nullish(),
});

export const postalAddressSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullish().transform((value) => (value ? value : null)),
  city: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(20),
  country,
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+()\-.\s]*$/, "Invalid phone number")
    .nullish()
    .transform((value) => (value ? value : null)),
});

export const placeOrderSchema = z.object({
  customer: z.object({
    email: z.email().max(254),
    name: z.string().trim().min(1).max(120),
  }),
  shippingAddress: postalAddressSchema,
  shippingMethod: z.enum(SHIPPING_METHODS),
  couponCode: z.string().trim().max(64).nullish(),
});

export const expireOrdersSchema = z
  .object({
    olderThanSeconds: z.int().min(0).max(365 * 86_400).optional(),
  })
  .default({});

/** Cart ids are opaque UUID-like tokens; anything else is ignored (a fresh cart is used). */
export function parseCartId(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

export function headerValue(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : null;
}

// ── operations ────────────────────────────────────────────────────────────
const ORDER_STATUSES = ["placed", "paid", "fulfilling", "shipped", "delivered", "partially_refunded", "refunded", "cancelled"] as const;
const RETURN_STATUSES = ["requested", "approved", "rejected", "refunded"] as const;
const isoDateTime = z.iso.datetime({ offset: true });

/** Route ids are UUIDs minted by this service; anything longer than an id is rejected before touching the database. */
export const routeIdSchema = z.string().trim().min(1).max(64);

export const returnRequestSchema = z.object({
  lines: z
    .array(z.object({ sku, qty: z.int().min(1).max(MAX_QTY) }))
    .min(1)
    .max(50),
  reason: z.string().trim().min(1).max(1000),
});

export const transitionSchema = z.object({
  status: z.enum(["fulfilling", "shipped", "delivered"]),
  carrier: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(64).regex(/^[A-Za-z0-9 ._\-/]*$/, "Invalid tracking number").optional(),
});

export const refundRequestSchema = z.object({
  amountCents: z.int(),
  reason: z.string().trim().min(1).max(500),
});

export const returnDecisionSchema = z.object({
  approve: z.boolean(),
  refundCents: z.int().min(0).optional(),
  restock: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
});

const couponTerms = {
  type: z.enum(["percent", "fixed"]),
  value: z.int(),
  minBasketCents: z.int().min(0),
  maxRedemptions: z.int().min(1).nullable(),
  oncePerCustomer: z.boolean(),
  active: z.boolean(),
  startsAt: isoDateTime.nullable(),
  expiresAt: isoDateTime.nullable(),
};

export const couponInputSchema = z.object({
  code: z.string().trim().min(2).max(32),
  ...couponTerms,
  minBasketCents: couponTerms.minBasketCents.default(0),
  maxRedemptions: couponTerms.maxRedemptions.default(null),
  oncePerCustomer: couponTerms.oncePerCustomer.default(false),
  active: couponTerms.active.default(true),
  startsAt: couponTerms.startsAt.default(null),
  expiresAt: couponTerms.expiresAt.default(null),
});

export const couponPatchSchema = z
  .object(couponTerms)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Nothing to change");

export const couponCodeSchema = z.string().trim().min(2).max(32);

const limit = (fallback: number) => z.coerce.number().int().min(1).max(100).default(fallback);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

export const adminOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional().transform((value) => value ?? null),
  q: optionalText(120),
  cursor: optionalText(256),
  limit: limit(20),
});

export const adminReturnsQuerySchema = z.object({
  status: z.enum(RETURN_STATUSES).optional().transform((value) => value ?? null),
  cursor: optionalText(256),
  limit: limit(20),
});
