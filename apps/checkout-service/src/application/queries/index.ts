import { GetAdminOrderHandler } from "./get-admin-order.handler";
import { GetCartHandler } from "./get-cart.handler";
import { GetInvoiceLinkHandler } from "./get-invoice-link.handler";
import { GetOrderHandler } from "./get-order.handler";
import { ListAdminOrdersHandler } from "./list-admin-orders.handler";
import { ListCouponsHandler } from "./list-coupons.handler";
import { ListMyOrdersHandler } from "./list-my-orders.handler";
import { ListReturnsHandler } from "./list-returns.handler";
import { QuoteCheckoutHandler } from "./quote-checkout.handler";

export * from "./get-admin-order.query";
export * from "./get-cart.query";
export * from "./get-invoice-link.query";
export * from "./get-order.query";
export * from "./list-admin-orders.query";
export * from "./list-coupons.query";
export * from "./list-my-orders.query";
export * from "./list-returns.query";
export * from "./quote-checkout.query";

export const QUERY_HANDLERS = [
  GetCartHandler,
  QuoteCheckoutHandler,
  ListMyOrdersHandler,
  GetOrderHandler,
  GetInvoiceLinkHandler,
  ListAdminOrdersHandler,
  GetAdminOrderHandler,
  ListReturnsHandler,
  ListCouponsHandler,
];
