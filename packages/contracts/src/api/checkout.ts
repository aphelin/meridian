import type {
  CancellationReason,
  Cents,
  CustomerRef,
  IsoDateTime,
  OrderLineSnapshot,
  OrderStatus,
  Page,
  PostalAddress,
  PricingBreakdown,
  ShippingMethodId,
  SkuQty,
} from "../common";
import type { PaymentIntentDto, PaymentSummaryDto } from "./payment";

export interface CartLineInput {
  sku: string;
  variantId: string;
  qty: number;
}

export interface CartDto {
  id: string;
  userId: string | null;
  lines: (CartLineInput & { slug: string; unitPriceCents: Cents })[];
  updatedAt: IsoDateTime;
}

export interface ShippingOptionDto {
  id: ShippingMethodId;
  label: string;
  description: string;
  priceCents: Cents;
  etaDays: [number, number] | null;
}

export interface QuoteRequest {
  /** Omit to quote the caller's server cart. */
  lines?: CartLineInput[];
  shippingMethod: ShippingMethodId;
  country: string;
  couponCode?: string | null;
  email?: string | null;
}

export interface QuoteDto {
  lines: OrderLineSnapshot[];
  pricing: PricingBreakdown;
  shippingOptions: ShippingOptionDto[];
  coupon: { code: string; applied: boolean; message: string; discountCents: Cents } | null;
}

export interface PlaceOrderRequest {
  customer: { email: string; name: string };
  shippingAddress: PostalAddress;
  shippingMethod: ShippingMethodId;
  couponCode?: string | null;
}

export interface PlaceOrderResultDto {
  order: OrderDto;
  payment: PaymentIntentDto;
  /** Present for guest orders; send as `x-order-access` to read or act on the order. */
  accessToken: string | null;
}

export interface TimelineEntryDto {
  status: OrderStatus | "refund" | "return";
  at: IsoDateTime;
  note: string | null;
}

export interface ReturnDto {
  id: string;
  orderId: string;
  status: "requested" | "approved" | "rejected" | "refunded";
  lines: SkuQty[];
  reason: string;
  refundCents: Cents | null;
  note: string | null;
  createdAt: IsoDateTime;
  decidedAt: IsoDateTime | null;
}

export interface RefundDto {
  id: string;
  amountCents: Cents;
  reason: string;
  status: "pending" | "succeeded" | "failed";
  createdAt: IsoDateTime;
}

export interface OrderDto {
  id: string;
  number: string;
  status: OrderStatus;
  customer: CustomerRef;
  shippingAddress: PostalAddress;
  shippingMethod: { id: ShippingMethodId; label: string };
  lines: OrderLineSnapshot[];
  pricing: PricingBreakdown;
  couponCode: string | null;
  refundedCents: Cents;
  cancellationReason: CancellationReason | null;
  fulfillment: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; shippedAt: IsoDateTime | null; deliveredAt: IsoDateTime | null };
  invoice: { number: string; issuedAt: IsoDateTime } | null;
  returns: ReturnDto[];
  refunds: RefundDto[];
  timeline: TimelineEntryDto[];
  /** What the viewer may do right now. */
  actions: { cancel: boolean; requestReturn: boolean; downloadInvoice: boolean; pay: boolean };
  paymentDeadline: IsoDateTime | null;
  createdAt: IsoDateTime;
  correlationId: string;
}

export interface OrderSummaryDto {
  id: string;
  number: string;
  status: OrderStatus;
  totalCents: Cents;
  itemCount: number;
  lines: Pick<OrderLineSnapshot, "sku" | "slug" | "productName" | "qty">[];
  createdAt: IsoDateTime;
}

export interface AdminOrderDto extends OrderDto {
  payment: PaymentSummaryDto | null;
  audit: { action: string; actorId: string; at: IsoDateTime; meta: unknown }[];
}

export type AdminOrderListDto = Page<OrderSummaryDto & { customer: CustomerRef }>;

export interface TransitionRequest {
  status: "fulfilling" | "shipped" | "delivered";
  carrier?: string;
  trackingNumber?: string;
}

export interface RefundRequest {
  amountCents: Cents;
  reason: string;
}

export interface ReturnRequestInput {
  lines: SkuQty[];
  reason: string;
}

export interface ReturnDecisionInput {
  approve: boolean;
  refundCents?: Cents;
  restock?: boolean;
  note?: string;
}

export type CouponType = "percent" | "fixed";

export interface CouponDto {
  code: string;
  type: CouponType;
  /** Percent (1–100) or cents, depending on type. */
  value: number;
  minBasketCents: Cents;
  maxRedemptions: number | null;
  redemptions: number;
  oncePerCustomer: boolean;
  active: boolean;
  startsAt: IsoDateTime | null;
  expiresAt: IsoDateTime | null;
}

export type CouponInput = Omit<CouponDto, "redemptions">;

export interface InvoiceLinkDto {
  url: string;
  expiresAt: IsoDateTime;
}
