import { SearchProductsHandler } from "./search-products.handler";
import { SuggestProductsHandler } from "./suggest-products.handler";

export * from "./search-products.handler";
export * from "./search-products.query";
export * from "./suggest-products.handler";
export * from "./suggest-products.query";

export const QueryHandlers = [SearchProductsHandler, SuggestProductsHandler];
