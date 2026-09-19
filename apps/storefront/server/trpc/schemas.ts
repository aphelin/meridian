import type {
  AddressInput,
  CartLineInput,
  ChaosRuleInput,
  ContactRequest,
  CouponInput,
  PlaceOrderRequest,
  PostalAddress,
  ProductDetailsDto,
  ProductInput,
  QuoteRequest,
  RefundRequest,
  ReturnDecisionInput,
  ReturnRequestInput,
  SearchQuery,
  StockAlertRequest,
  TransitionRequest,
  VariantInput,
} from "@meridian/contracts";
import { z } from "zod";
import { SERVICE_NAMES } from "../system";

/** Inputs mirror the contracts DTOs; services validate again, these bound sizes and shapes at the edge. */

export const COLOR_FAMILIES = ["neutral", "white", "black", "grey", "brown", "green", "blue", "red", "orange", "yellow", "pink", "metal"] as const;
export const SHIPPING_METHODS = ["standard", "express", "white-glove", "collect"] as const;
export const ORDER_STATUSES = ["placed", "paid", "fulfilling", "shipped", "delivered", "cancelled", "refunded", "partially_refunded"] as const;

export const slug = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid product reference.");
export const sku = z.string().trim().min(1).max(64);
export const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Invalid id.");
export const orderId = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/, "Invalid order id.");
export const email = z.string().trim().max(254).pipe(z.email("Enter a valid email address."));
export const cursor = z.string().max(1024).optional();
export const captchaToken = z.string().trim().min(1).max(4096).optional();
/** Guest order access token from an email link (`?access=`). */
export const accessToken = z.string().trim().max(128).regex(/^[A-Za-z0-9_-]*$/, "Invalid access link.").optional();
const country = z.string().trim().regex(/^[A-Za-z]{2}$/, "Use a two-letter country code.").transform((v) => v.toUpperCase());

export const cartLine = z.object({
  sku,
  variantId: z.string().trim().min(1).max(64),
  qty: z.number().int().min(1).max(20),
}) satisfies z.ZodType<CartLineInput>;

export const searchQuery = z.object({
  q: z.string().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  materials: z.array(z.string().max(100)).max(20).optional(),
  colors: z.array(z.enum(COLOR_FAMILIES)).max(12).optional(),
  minPriceCents: z.number().int().min(0).max(100_000_000).optional(),
  maxPriceCents: z.number().int().min(0).max(100_000_000).optional(),
  inStock: z.boolean().optional(),
  sort: z.enum(["relevance", "featured", "newest", "price-asc", "price-desc", "name"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().max(1024).optional(),
}) satisfies z.ZodType<SearchQuery>;

export const postalAddress = z.object({
  fullName: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullable(),
  city: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(20),
  country,
  phone: z.string().trim().max(40).nullable(),
}) satisfies z.ZodType<PostalAddress, unknown>;

export const addressInput = postalAddress.extend({
  label: z.string().trim().max(40).nullable().optional(),
  isDefault: z.boolean().optional(),
}) satisfies z.ZodType<AddressInput, unknown>;

export const addressPatch = addressInput.partial().refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update.");

export const quoteRequest = z.object({
  lines: z.array(cartLine).max(50).optional(),
  shippingMethod: z.enum(SHIPPING_METHODS),
  country,
  couponCode: z.string().trim().max(64).nullable().optional(),
  email: email.nullable().optional(),
}) satisfies z.ZodType<QuoteRequest, unknown>;

export const placeOrderRequest = z.object({
  customer: z.object({ email, name: z.string().trim().min(1).max(120) }),
  shippingAddress: postalAddress,
  shippingMethod: z.enum(SHIPPING_METHODS),
  couponCode: z.string().trim().max(64).nullable().optional(),
}) satisfies z.ZodType<PlaceOrderRequest, unknown>;

export const returnRequest = z.object({
  lines: z.array(z.object({ sku, qty: z.number().int().min(1).max(20) })).min(1).max(50),
  reason: z.string().trim().min(1).max(1000),
}) satisfies z.ZodType<ReturnRequestInput>;

export const stockAlertRequest = z.object({ email, sku, slug }) satisfies z.ZodType<StockAlertRequest, unknown>;

export const contactRequest = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  topic: z.enum(["order", "product", "returns", "other"]),
  orderNumber: z.string().trim().max(40).nullable().optional(),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(5000),
}) satisfies z.ZodType<ContactRequest, unknown>;

export const newPassword = z.string().min(8, "Use at least 8 characters.").max(256);
export const existingPassword = z.string().min(1, "Enter your password.").max(256);
export const oneTimeToken = z.string().trim().min(1).max(512);

// ── admin ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const isoDateTime = z.iso.datetime({ offset: true });
const assetUrl = z.string().trim().min(1).max(500).regex(/^(\/\S*|https?:\/\/\S+)$/, "Use a site path or an http(s) URL.");
const measure = z.number().positive().max(10_000).nullable();

export const productDetails = z.object({
  widthCm: measure,
  depthCm: measure,
  heightCm: measure,
  weightKg: measure,
  construction: z.string().trim().max(2000).nullable(),
  care: z.string().trim().max(2000).nullable(),
}) satisfies z.ZodType<ProductDetailsDto>;

export const productInput = z.object({
  slug,
  name: z.string().trim().min(1).max(120),
  kind: z.string().trim().min(1).max(120),
  story: z.string().trim().min(1).max(2000),
  categoryId: z.string().trim().min(1).max(40),
  materials: z.array(z.string().trim().min(1).max(40)).max(20),
  priceCents: z.number().int().positive().max(100_000_000),
  featured: z.boolean(),
  soldOut: z.boolean(),
  heroImageUrl: assetUrl,
  detailImageUrl: assetUrl.nullable(),
  details: productDetails,
}) satisfies z.ZodType<ProductInput>;

export const variantInput = z.object({
  id: z.string().trim().min(1).max(40),
  sku: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  colorFamily: z.enum(COLOR_FAMILIES),
  material: z.string().trim().min(1).max(40),
  swatchUrl: assetUrl,
  imageUrl: assetUrl,
}) satisfies z.ZodType<VariantInput>;

export const transitionRequest = z.object({
  status: z.enum(["fulfilling", "shipped", "delivered"]),
  carrier: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(64).optional(),
}) satisfies z.ZodType<TransitionRequest>;

export const refundRequest = z.object({
  amountCents: z.number().int().positive().max(100_000_000),
  reason: z.string().trim().min(1).max(500),
}) satisfies z.ZodType<RefundRequest>;

export const returnDecision = z.object({
  approve: z.boolean(),
  refundCents: z.number().int().min(0).max(100_000_000).optional(),
  restock: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
}) satisfies z.ZodType<ReturnDecisionInput>;

const couponTerms = {
  type: z.enum(["percent", "fixed"]),
  value: z.number().int().min(1).max(100_000_000),
  minBasketCents: z.number().int().min(0).max(100_000_000),
  maxRedemptions: z.number().int().min(1).nullable(),
  oncePerCustomer: z.boolean(),
  active: z.boolean(),
  startsAt: isoDateTime.nullable(),
  expiresAt: isoDateTime.nullable(),
};

export const couponInput = z.object({ code: z.string().trim().min(2).max(32), ...couponTerms }) satisfies z.ZodType<CouponInput>;
export const couponPatch = z.object(couponTerms).partial().refine((v) => Object.keys(v).length > 0, "Nothing to change.");
export const couponCode = z.string().trim().min(2).max(32);

export const stockAdjust = z
  .object({
    sku,
    onHand: z.number().int().min(0).max(1_000_000).optional(),
    delta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    reason: z.string().trim().min(1).max(200),
  })
  .refine((v) => (v.onHand === undefined) !== (v.delta === undefined), { message: "Provide exactly one of onHand or delta.", path: ["onHand"] });

export const serviceName = z.enum(SERVICE_NAMES);
export const messagingSource = z.enum(["rabbit", "kafka"]);
export const queueOrTopic = z.string().trim().min(1).max(255);

export const chaosRuleInput = z.object({
  target: z.string().trim().min(1).max(200),
  fault: z.enum(["fail", "delay", "timeout"]),
  rate: z.number().min(0).max(1),
  delayMs: z.number().int().min(0).max(120_000),
  ttlSec: z.number().int().min(1).max(86_400),
}) satisfies z.ZodType<ChaosRuleInput>;
