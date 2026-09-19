import type {
  CancellationReason,
  Cents,
  CustomerRef,
  IsoDateTime,
  OrderLineSnapshot,
  PostalAddress,
  PricingBreakdown,
  ProductSnapshot,
  ShippingMethodId,
  SkuQty,
} from "./common";
import type { BoundedContext, MessageEnvelope } from "./messaging";

export const Events = {
  // identity
  UserRegistered: "UserRegistered",
  UserEmailVerified: "UserEmailVerified",
  UserProfileUpdated: "UserProfileUpdated",
  UserDeleted: "UserDeleted",
  // catalog
  ProductPublished: "ProductPublished",
  ProductUpdated: "ProductUpdated",
  ProductArchived: "ProductArchived",
  ReviewPosted: "ReviewPosted",
  // inventory
  StockReserved: "StockReserved",
  StockReservationReleased: "StockReservationReleased",
  StockCommitted: "StockCommitted",
  StockAdjusted: "StockAdjusted",
  StockDepleted: "StockDepleted",
  StockReplenished: "StockReplenished",
  // checkout
  OrderPlaced: "OrderPlaced",
  OrderPaid: "OrderPaid",
  OrderCancelled: "OrderCancelled",
  OrderFulfilling: "OrderFulfilling",
  OrderShipped: "OrderShipped",
  OrderDelivered: "OrderDelivered",
  OrderRefunded: "OrderRefunded",
  ReturnRequested: "ReturnRequested",
  ReturnApproved: "ReturnApproved",
  ReturnRejected: "ReturnRejected",
  CouponRedeemed: "CouponRedeemed",
  InvoiceIssued: "InvoiceIssued",
  // payment
  PaymentSucceeded: "PaymentSucceeded",
  PaymentFailed: "PaymentFailed",
  PaymentVoided: "PaymentVoided",
  PaymentRefunded: "PaymentRefunded",
  RefundFailed: "RefundFailed",
  // notification
  EmailSent: "EmailSent",
  EmailDeadLettered: "EmailDeadLettered",
} as const;
export type EventName = (typeof Events)[keyof typeof Events];

/** Which Kafka topic (bounded context) each event is published on. */
export const EventContext: Record<EventName, BoundedContext> = {
  UserRegistered: "identity",
  UserEmailVerified: "identity",
  UserProfileUpdated: "identity",
  UserDeleted: "identity",
  ProductPublished: "catalog",
  ProductUpdated: "catalog",
  ProductArchived: "catalog",
  ReviewPosted: "catalog",
  StockReserved: "inventory",
  StockReservationReleased: "inventory",
  StockCommitted: "inventory",
  StockAdjusted: "inventory",
  StockDepleted: "inventory",
  StockReplenished: "inventory",
  OrderPlaced: "checkout",
  OrderPaid: "checkout",
  OrderCancelled: "checkout",
  OrderFulfilling: "checkout",
  OrderShipped: "checkout",
  OrderDelivered: "checkout",
  OrderRefunded: "checkout",
  ReturnRequested: "checkout",
  ReturnApproved: "checkout",
  ReturnRejected: "checkout",
  CouponRedeemed: "checkout",
  InvoiceIssued: "checkout",
  PaymentSucceeded: "payment",
  PaymentFailed: "payment",
  PaymentVoided: "payment",
  PaymentRefunded: "payment",
  RefundFailed: "payment",
  EmailSent: "notification",
  EmailDeadLettered: "notification",
};

export interface OrderHeader {
  orderId: string;
  /** Human order number, e.g. "M-7F3K2Q9A". */
  number: string;
  customer: CustomerRef;
}

export interface EventPayloads {
  UserRegistered: { userId: string; email: string; name: string };
  UserEmailVerified: { userId: string; email: string };
  UserProfileUpdated: { userId: string; name: string };
  UserDeleted: { userId: string; email: string };

  ProductPublished: { product: ProductSnapshot };
  ProductUpdated: { product: ProductSnapshot; changed: string[] };
  ProductArchived: { productId: string; slug: string };
  ReviewPosted: { reviewId: string; productId: string; slug: string; userId: string; rating: number; ratingAvg: number; ratingCount: number };

  StockReserved: { orderId: string; lines: SkuQty[]; expiresAt: IsoDateTime };
  StockReservationReleased: { orderId: string; lines: SkuQty[]; reason: "cancelled" | "expired" | "payment-failed" };
  StockCommitted: { orderId: string; lines: SkuQty[] };
  StockAdjusted: { sku: string; onHand: number; reserved: number; available: number; previousAvailable: number; actorId: string | null; reason: string };
  StockDepleted: { sku: string };
  StockReplenished: { sku: string; available: number };

  OrderPlaced: OrderHeader & {
    lines: OrderLineSnapshot[];
    pricing: PricingBreakdown;
    shippingAddress: PostalAddress;
    shippingMethod: ShippingMethodId;
    couponCode: string | null;
    placedAt: IsoDateTime;
  };
  OrderPaid: OrderHeader & { lines: OrderLineSnapshot[]; pricing: PricingBreakdown; paymentId: string; paidAt: IsoDateTime };
  OrderCancelled: OrderHeader & { reason: CancellationReason; refundRequired: boolean; totalCents: Cents; cancelledAt: IsoDateTime };
  OrderFulfilling: OrderHeader;
  OrderShipped: OrderHeader & { carrier: string; trackingNumber: string; trackingUrl: string; shippedAt: IsoDateTime };
  OrderDelivered: OrderHeader & { lines: Pick<OrderLineSnapshot, "sku" | "slug" | "productName">[]; deliveredAt: IsoDateTime };
  OrderRefunded: OrderHeader & { refundId: string; amountCents: Cents; totalRefundedCents: Cents; full: boolean; reason: string };
  ReturnRequested: OrderHeader & { returnId: string; lines: SkuQty[]; reason: string };
  ReturnApproved: OrderHeader & { returnId: string; lines: SkuQty[]; refundCents: Cents; restock: boolean };
  ReturnRejected: OrderHeader & { returnId: string; note: string };
  CouponRedeemed: { couponCode: string; orderId: string; customerKey: string; discountCents: Cents };
  InvoiceIssued: OrderHeader & { invoiceNumber: string; totalCents: Cents; issuedAt: IsoDateTime };

  PaymentSucceeded: { paymentId: string; orderId: string; transactionId: string; amountCents: Cents; provider: PaymentProviderId };
  PaymentFailed: { paymentId: string; orderId: string; transactionId: string; reason: string };
  PaymentVoided: { paymentId: string; orderId: string; reason: string };
  PaymentRefunded: { paymentId: string; orderId: string; refundId: string; amountCents: Cents; provider: PaymentProviderId };
  RefundFailed: { orderId: string; refundId: string; reason: string };

  EmailSent: { deliveryId: string; template: EmailTemplate; to: string };
  EmailDeadLettered: { deliveryId: string; template: EmailTemplate; to: string; error: string };
}

export type PaymentProviderId = "local-sandbox" | "paddle-sandbox" | "stripe-test";

export type EmailTemplate =
  | "verify-email"
  | "password-reset"
  | "password-changed"
  | "account-deleted"
  | "order-confirmation"
  | "order-shipped"
  | "order-delivered"
  | "order-cancelled"
  | "order-refunded"
  | "return-received"
  | "return-approved"
  | "return-rejected"
  | "invoice-issued"
  | "newsletter-confirm"
  | "newsletter-welcome"
  | "contact-received"
  | "contact-internal"
  | "back-in-stock";

export type EventEnvelope<N extends EventName = EventName> = MessageEnvelope<N, EventPayloads[N]>;
