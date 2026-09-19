import { AnonymiseCustomerHandler } from "./anonymise-customer.handler";
import { CancelOrderHandler } from "./cancel-order.handler";
import { ClearCartHandler } from "./clear-cart.handler";
import { ConfirmOrderPaymentHandler } from "./confirm-order-payment.handler";
import { CreateCouponHandler } from "./create-coupon.handler";
import { DecideReturnHandler } from "./decide-return.handler";
import { ExpireOrdersHandler } from "./expire-orders.handler";
import { GenerateInvoiceHandler } from "./generate-invoice.handler";
import { MergeCartHandler } from "./merge-cart.handler";
import { PlaceOrderHandler } from "./place-order.handler";
import { PurgeIdleCartsHandler } from "./purge-idle-carts.handler";
import { RecordRefundOutcomeHandler } from "./record-refund-outcome.handler";
import { ReplaceCartItemsHandler } from "./replace-cart-items.handler";
import { RequestRefundHandler } from "./request-refund.handler";
import { RequestReturnHandler } from "./request-return.handler";
import { SeedCouponsHandler } from "./seed-coupons.handler";
import { TransitionOrderHandler } from "./transition-order.handler";
import { UpdateCouponHandler } from "./update-coupon.handler";

export * from "./anonymise-customer.command";
export * from "./cancel-order.command";
export * from "./clear-cart.command";
export * from "./confirm-order-payment.command";
export * from "./create-coupon.command";
export * from "./decide-return.command";
export * from "./expire-orders.command";
export * from "./generate-invoice.command";
export * from "./merge-cart.command";
export * from "./place-order.command";
export * from "./purge-idle-carts.command";
export * from "./record-refund-outcome.command";
export * from "./replace-cart-items.command";
export * from "./request-refund.command";
export * from "./request-return.command";
export * from "./seed-coupons.command";
export * from "./transition-order.command";
export * from "./update-coupon.command";

export const COMMAND_HANDLERS = [
  // cart and checkout (core)
  ReplaceCartItemsHandler,
  MergeCartHandler,
  ClearCartHandler,
  PlaceOrderHandler,
  ConfirmOrderPaymentHandler,
  ExpireOrdersHandler,
  AnonymiseCustomerHandler,
  SeedCouponsHandler,
  PurgeIdleCartsHandler,
  // operations
  CancelOrderHandler,
  RequestReturnHandler,
  TransitionOrderHandler,
  RequestRefundHandler,
  DecideReturnHandler,
  RecordRefundOutcomeHandler,
  GenerateInvoiceHandler,
  CreateCouponHandler,
  UpdateCouponHandler,
];

export { CHECKOUT_IDENTITY_GROUP } from "./anonymise-customer.handler";
export { CONFIRM_PAYMENT_CONSUMER } from "./confirm-order-payment.handler";
export { EXPIRY_BATCH_SIZE } from "./expire-orders.handler";
export { INVOICE_CONTENT_TYPE } from "./generate-invoice.handler";
export { SEED_COUPONS } from "./seed-coupons.handler";
