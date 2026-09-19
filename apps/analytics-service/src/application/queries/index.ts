import { GetAnalyticsOverviewHandler } from "./get-overview.handler";
import { GetTopProductsHandler } from "./get-top-products.handler";

export * from "./get-overview.handler";
export * from "./get-overview.query";
export * from "./get-top-products.handler";
export * from "./get-top-products.query";

export const QueryHandlers = [GetAnalyticsOverviewHandler, GetTopProductsHandler];
